"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

// Constants
const VALIDATION_RULES = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  MIN_PASSWORD_LENGTH: 6,
} as const;

const ERROR_MESSAGES = {
  EMAIL_REQUIRED: "Email is required.",
  EMAIL_INVALID: "Please enter a valid email address.",
  PASSWORD_REQUIRED: "Password is required.",
  PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION_RULES.MIN_PASSWORD_LENGTH} characters.`,
  LOGIN_FAILED: "Invalid email or password.",
  NETWORK_ERROR: "Network error occurred. Please try again.",
} as const;

// Types
interface FormErrors {
  email?: string;
  password?: string;
  submit?: string;
}

interface LoginFormData {
  email: string;
  password: string;
}

export default function LoginPage() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { user, loading, login, requireGuest } = useAuth();
  const router = useRouter();

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && user) {
      requireGuest("/users");
    }
  }, [loading, user, requireGuest]);

  // Validation function with comprehensive checks
  const validateForm = useCallback((): FormErrors => {
    const newErrors: FormErrors = {};
    
    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = ERROR_MESSAGES.EMAIL_REQUIRED;
    } else if (!VALIDATION_RULES.EMAIL_REGEX.test(formData.email.trim())) {
      newErrors.email = ERROR_MESSAGES.EMAIL_INVALID;
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = ERROR_MESSAGES.PASSWORD_REQUIRED;
    } else if (formData.password.length < VALIDATION_RULES.MIN_PASSWORD_LENGTH) {
      newErrors.password = ERROR_MESSAGES.PASSWORD_TOO_SHORT;
    }
    
    return newErrors;
  }, [formData.email, formData.password]);

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof LoginFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setFormData(prev => ({ ...prev, [field]: value }));
      
      // Clear field-specific errors when user starts typing
      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // Toggle password visibility
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Clear previous errors
    setErrors({});
    
    // Validate form
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Logging in...");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        login(data.token, data.user);
        toast.success("Login successful!", { id: toastId });
        router.push("/users");
      } else {
        const errorMessage = data.message || ERROR_MESSAGES.LOGIN_FAILED;
        setErrors({ submit: errorMessage });
        toast.error(errorMessage, { id: toastId });
      }
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
      setErrors({ submit: errorMessage });
      toast.error(errorMessage, { id: toastId });
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateForm, login, router]);

  // Memoized form validity check
  const isFormValid = useMemo(() => {
    const validationErrors = validateForm();
    return Object.keys(validationErrors).length === 0;
  }, [validateForm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center">Login</h1>
        
        {/* Display submit errors */}
        {errors.submit && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {errors.submit}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-900"
            >
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={formData.email}
              onChange={handleInputChange('email')}
              disabled={isSubmitting}
              className={`block w-full px-3 py-2 mt-1 placeholder-gray-400 border rounded-md shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-offset-2 sm:text-sm transition-colors ${
                errors.email
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
              } ${isSubmitting ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              placeholder="Enter your email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-2 text-sm text-red-600" role="alert">
                {errors.email}
              </p>
            )}
          </div>
          
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-900"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleInputChange('password')}
                disabled={isSubmitting}
                className={`block w-full px-3 py-2 mt-1 placeholder-gray-400 border rounded-md shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-offset-2 sm:text-sm pr-10 transition-colors ${
                  errors.password
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                } ${isSubmitting ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                disabled={isSubmitting}
                className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                      clipRule="evenodd"
                    />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="mt-2 text-sm text-red-600" role="alert">
                {errors.password}
              </p>
            )}
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
              className={`w-full px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 ${
                isSubmitting || !isFormValid
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="w-4 h-4 mr-2 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Logging in...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-800 mb-3">
            <strong>Demo Credentials:</strong> Use any seeded user email with
            password: <code className="px-1 py-0.5 bg-blue-100 rounded">User123@</code>
          </p>
          <button
            type="button"
            onClick={() => setFormData({
              email: "admin@example.com",
              password: "User123@"
            })}
            disabled={isSubmitting}
            className="text-xs text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Click to fill demo credentials
          </button>
        </div>
      </div>
    </div>
  );
}
