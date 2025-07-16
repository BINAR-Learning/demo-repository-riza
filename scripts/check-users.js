const { Pool } = require("pg");
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "workshop_db",
  password: process.env.DB_PASSWORD || "admin123",
  port: parseInt(process.env.DB_PORT || "5432"),
});

async function checkUsers() {
  try {
    const result = await pool.query("SELECT email FROM auth LIMIT 10");
    console.log("Available emails:");
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.email}`);
    });
    
    // Also check if there's an admin user
    const adminResult = await pool.query("SELECT email FROM auth WHERE email LIKE '%admin%' OR email LIKE '%test%' LIMIT 5");
    console.log("\nAdmin/Test emails:");
    adminResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.email}`);
    });
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

checkUsers();
