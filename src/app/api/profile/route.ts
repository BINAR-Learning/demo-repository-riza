import { NextRequest, NextResponse } from "next/server";
import { executeQuery } from "@/lib/database";
import { authMiddleware } from "@/lib/jwt";
import { z } from "zod";

// Enhanced type definitions
interface AuthenticatedUser {
  userId: string;
  username: string;
  email: string;
  fullName: string;
}

interface AuthenticatedRequest extends NextRequest {
  user: AuthenticatedUser;
}

interface ProfileResponse {
  id: number;
  authId: number;
  username: string;
  fullName: string;
  email: string;
  bio?: string;
  longBio?: string;
  profileJson?: any;
  address?: string;
  phoneNumber?: string;
  birthDate?: string;
  role?: string;
  division?: string;
  logCount?: number;
  roleCount?: number;
  divisionCount?: number;
}

// Validation schema using Zod
const profileUpdateSchema = z.object({
  username: z
    .string()
    .min(6, "Username must be at least 6 characters")
    .max(50, "Username must be 50 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  fullName: z
    .string()
    .min(1, "Full name is required")
    .max(100, "Full name must be 100 characters or less")
    .trim(),
  email: z
    .string()
    .email("Must be a valid email format")
    .max(255, "Email must be 255 characters or less"),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-()]{10,20}$/, "Phone must be a valid format (10-20 characters)")
    .optional(),
  birthDate: z
    .string()
    .optional()
    .refine((date) => {
      if (!date) return true;
      const birthDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return birthDate <= today;
    }, "Birth date cannot be in the future"),
  bio: z
    .string()
    .max(160, "Bio must be 160 characters or less")
    .optional(),
  longBio: z
    .string()
    .max(2000, "Long bio must be 2000 characters or less")
    .optional(),
  address: z
    .string()
    .max(500, "Address must be 500 characters or less")
    .optional(),
  profileJson: z
    .record(z.string(), z.any())
    .optional(),
});

type ProfileUpdateData = z.infer<typeof profileUpdateSchema>;

// Constants for queries (optimized)
const QUERIES = {
  // Optimized: Removed subqueries, simplified JOINs
  GET_PROFILE_BASIC: `
    SELECT 
      u.id,
      u.auth_id,
      u.username,
      u.full_name,
      u.bio,
      u.long_bio,
      u.profile_json,
      u.address,
      u.phone_number,
      u.birth_date,
      u.created_at,
      u.updated_at,
      a.email,
      ur.role,
      ud.division_name
    FROM users u
    LEFT JOIN auth a ON u.auth_id = a.id
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN user_divisions ud ON u.id = ud.user_id
    WHERE u.id = $1
    LIMIT 1
  `,
  
  // Separate lightweight query for counts (only when needed)
  GET_PROFILE_COUNTS: `
    SELECT 
      (SELECT COUNT(*) FROM user_logs WHERE user_id = $1) as log_count,
      (SELECT COUNT(*) FROM user_roles WHERE user_id = $1) as role_count,
      (SELECT COUNT(*) FROM user_divisions WHERE user_id = $1) as division_count
  `,
  
  // Optimized: Use RETURNING clause to eliminate redundant SELECT
  UPDATE_PROFILE_WITH_RETURNING: `
    UPDATE users 
    SET 
      username = $1,
      full_name = $2,
      bio = $3,
      long_bio = $4,
      address = $5,
      phone_number = $6,
      profile_json = $7,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $8
    RETURNING id, username, full_name, bio, long_bio, address, phone_number, birth_date, updated_at
  `,
  
  // Get role and division info after update
  GET_UPDATED_PROFILE_CONTEXT: `
    SELECT ur.role, ud.division_name, a.email
    FROM users u
    LEFT JOIN auth a ON u.auth_id = a.id
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN user_divisions ud ON u.id = ud.user_id
    WHERE u.id = $1
  `,
  
  // Async logging query
  LOG_PROFILE_UPDATE: `
    INSERT INTO user_logs (user_id, action, created_at) 
    VALUES ($1, 'update_profile', CURRENT_TIMESTAMP)
  `,
} as const;

// Simple in-memory cache (for demonstration - in production use Redis)
interface CacheEntry {
  data: ProfileResponse;
  timestamp: number;
  etag: string;
}

const profileCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 1000; // Prevent memory leaks

// Utility functions
const generateETag = (data: any): string => {
  const hash = require('crypto')
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
  return `"${hash}"`;
};

const mapDbRowToProfile = (row: any, counts?: any): ProfileResponse => {
  const profile: ProfileResponse = {
    id: row.id,
    authId: row.auth_id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    bio: row.bio,
    longBio: row.long_bio,
    profileJson: row.profile_json,
    address: row.address,
    phoneNumber: row.phone_number,
    birthDate: row.birth_date,
    role: row.role,
    division: row.division_name,
  };

  // Add counts if provided
  if (counts) {
    profile.logCount = parseInt(counts.log_count) || 0;
    profile.roleCount = parseInt(counts.role_count) || 0;
    profile.divisionCount = parseInt(counts.division_count) || 0;
  }

  return profile;
};

const createErrorResponse = (message: string, status: number = 500, errors?: any) => {
  return NextResponse.json(
    { 
      success: false, 
      message, 
      timestamp: new Date().toISOString(),
      ...(errors && { errors }) 
    },
    { status }
  );
};

const createSuccessResponse = (data: any, etag?: string, cacheHeaders = false) => {
  const response = NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...data,
  });

  // Add performance headers
  if (etag) {
    response.headers.set('ETag', etag);
  }

  if (cacheHeaders) {
    response.headers.set('Cache-Control', 'private, max-age=300, must-revalidate');
  }

  return response;
};

// Cache management
const getCachedProfile = (userId: string): CacheEntry | null => {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  if (cached) {
    profileCache.delete(userId); // Remove expired entry
  }
  return null;
};

const setCachedProfile = (userId: string, data: ProfileResponse) => {
  // Prevent memory leaks
  if (profileCache.size >= CACHE_MAX_SIZE) {
    const firstKey = profileCache.keys().next().value;
    if (firstKey) {
      profileCache.delete(firstKey);
    }
  }

  const etag = generateETag(data);
  profileCache.set(userId, {
    data,
    timestamp: Date.now(),
    etag,
  });
  return etag;
};

const invalidateCache = (userId: string) => {
  profileCache.delete(userId);
};

// Async logging function (non-blocking)
const logProfileUpdate = (userId: string) => {
  setImmediate(async () => {
    try {
      await executeQuery(QUERIES.LOG_PROFILE_UPDATE, [userId]);
    } catch (error) {
      console.error('Async logging error:', error);
      // Don't throw - logging failures shouldn't affect the main response
    }
  });
};

/**
 * GET /api/profile - Retrieve user profile information
 * Optimized with caching, simplified queries, and proper error handling
 */
async function getProfile(request: AuthenticatedRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const { userId } = request.user;
    const cacheKey = `profile_${userId}`;

    // Check ETag for conditional requests
    const ifNoneMatch = request.headers.get('if-none-match');
    
    console.time("Profile Get - Cache Check");
    const cached = getCachedProfile(userId);
    console.timeEnd("Profile Get - Cache Check");

    if (cached) {
      // Return 304 if ETag matches
      if (ifNoneMatch === cached.etag) {
        return new NextResponse(null, { 
          status: 304,
          headers: {
            'ETag': cached.etag,
            'Cache-Control': 'private, max-age=300, must-revalidate'
          }
        });
      }
      
      // Return cached data
      console.log(`Profile GET cache hit for user ${userId}`);
      return createSuccessResponse({ user: cached.data }, cached.etag, true);
    }

    console.time("Profile Get - Database Query");
    
    // Optimized: Single query without expensive subqueries
    const profileResult = await executeQuery(QUERIES.GET_PROFILE_BASIC, [userId]);

    if (profileResult.rows.length === 0) {
      console.timeEnd("Profile Get - Database Query");
      return createErrorResponse("User not found", 404);
    }

    const profileData = profileResult.rows[0];

    // Only get counts if specifically requested (via query parameter)
    const includeCounts = request.nextUrl.searchParams.get('includeCounts') === 'true';
    let countsData = null;

    if (includeCounts) {
      console.time("Profile Get - Counts Query");
      const countsResult = await executeQuery(QUERIES.GET_PROFILE_COUNTS, [userId]);
      countsData = countsResult.rows[0] || {};
      console.timeEnd("Profile Get - Counts Query");
    }

    console.timeEnd("Profile Get - Database Query");

    console.time("Profile Get - Data Processing");
    const userData = mapDbRowToProfile(profileData, countsData);
    
    // Cache the result
    const etag = setCachedProfile(userId, userData);
    console.timeEnd("Profile Get - Data Processing");

    const executionTime = Date.now() - startTime;
    console.log(`Profile GET executed in ${executionTime}ms for user ${userId}`);

    return createSuccessResponse({ user: userData }, etag, true);
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`Profile GET error after ${executionTime}ms:`, error);
    
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}

/**
 * PUT /api/profile - Update user profile information
 * Optimized with Zod validation, efficient queries, and async logging
 */
async function updateProfile(request: AuthenticatedRequest): Promise<NextResponse> {
  const startTime = Date.now();
  
  try {
    const { userId } = request.user;

    console.time("Profile Update - Request Parsing");
    const body = await request.json();
    console.timeEnd("Profile Update - Request Parsing");

    console.time("Profile Update - Validation");
    
    // Use Zod for robust validation
    const validationResult = profileUpdateSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.timeEnd("Profile Update - Validation");
      const formattedErrors = validationResult.error.issues.reduce((acc: Record<string, string>, issue) => {
        const field = issue.path.join('.');
        acc[field] = issue.message;
        return acc;
      }, {});

      return createErrorResponse("Validation failed", 400, formattedErrors);
    }

    const validatedData = validationResult.data;
    console.timeEnd("Profile Update - Validation");

    console.time("Profile Update - Database Operations");

    // Optimized: Use UPDATE...RETURNING to eliminate redundant SELECT
    const updateResult = await executeQuery(QUERIES.UPDATE_PROFILE_WITH_RETURNING, [
      validatedData.username,
      validatedData.fullName,
      validatedData.bio || null,
      validatedData.longBio || null,
      validatedData.address || null,
      validatedData.phone || null,
      validatedData.profileJson ? JSON.stringify(validatedData.profileJson) : null,
      userId,
    ]);

    if (updateResult.rows.length === 0) {
      console.timeEnd("Profile Update - Database Operations");
      return createErrorResponse("User not found", 404);
    }

    const updatedProfile = updateResult.rows[0];

    // Get additional context (role, division, email) in a separate lightweight query
    const contextResult = await executeQuery(QUERIES.GET_UPDATED_PROFILE_CONTEXT, [userId]);
    const contextData = contextResult.rows[0] || {};

    console.timeEnd("Profile Update - Database Operations");

    console.time("Profile Update - Response Preparation");

    // Combine updated profile with context data
    const responseData: ProfileResponse = {
      id: updatedProfile.id,
      authId: updatedProfile.auth_id || contextData.auth_id,
      username: updatedProfile.username,
      fullName: updatedProfile.full_name,
      email: contextData.email,
      bio: updatedProfile.bio,
      longBio: updatedProfile.long_bio,
      profileJson: updatedProfile.profile_json,
      address: updatedProfile.address,
      phoneNumber: updatedProfile.phone_number,
      birthDate: updatedProfile.birth_date,
      role: contextData.role,
      division: contextData.division_name,
    };

    // Invalidate cache for this user
    invalidateCache(userId);

    // Async logging (non-blocking)
    logProfileUpdate(userId);

    console.timeEnd("Profile Update - Response Preparation");

    const executionTime = Date.now() - startTime;
    console.log(`Profile UPDATE executed in ${executionTime}ms for user ${userId}`);

    return createSuccessResponse({ 
      user: responseData,
      message: "Profile updated successfully" 
    });
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`Profile UPDATE error after ${executionTime}ms:`, error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('unique constraint')) {
        return createErrorResponse("Username already exists", 409);
      }
      if (error.message.includes('foreign key constraint')) {
        return createErrorResponse("Invalid user reference", 400);
      }
    }
    
    return createErrorResponse(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}

// Enhanced middleware wrapper with better error handling
const withErrorHandling = (handler: (request: AuthenticatedRequest) => Promise<NextResponse>) => {
  return async (request: AuthenticatedRequest) => {
    try {
      return await handler(request);
    } catch (error) {
      console.error('Unhandled error in profile API:', error);
      return createErrorResponse("Internal server error");
    }
  };
};

// Export optimized route handlers
export const GET = authMiddleware(withErrorHandling(getProfile));
export const PUT = authMiddleware(withErrorHandling(updateProfile));

// Export types for use in other files
export type { ProfileResponse, ProfileUpdateData };

// Health check endpoint for monitoring
export async function HEAD(request: NextRequest) {
  return new NextResponse(null, { 
    status: 200,
    headers: {
      'X-Profile-API-Version': '2.0',
      'X-Cache-Size': profileCache.size.toString(),
    }
  });
}
