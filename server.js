require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./src/config/db");
const { notFound, globalErrorHandler } = require("./src/middleware/errorHandler");
const { runExpiryCron } = require("./src/jobs/expiryCron");

// Route imports
const authRoutes = require("./src/routes/authRoutes");
const clientRoutes = require("./src/routes/clientRoutes");
const projectRoutes = require("./src/routes/projectRoutes");
const planRoutes = require("./src/routes/planRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const paymentRoutes = require("./src/routes/paymentRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const activityLogRoutes = require("./src/routes/activityLogRoutes");
const serverRoutes = require("./src/routes/serverRoutes");
const domainRoutes = require("./src/routes/domainRoutes");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const webhookRoutes = require("./src/routes/webhookRoutes");

// Connect to Database
connectDB().then(() => {
  console.log("��� Database connected successfully");
  // Seed initial data
  seedData();
}).catch(err => {
  console.error(`❌ Database connection failed: ${err.message}`);
});

const app = express();

// CORS - must come before rate limiter and body parser
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Handle OPTIONS preflight
app.options("*", cors());

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased for development)
  message: { success: false, message: "Too many requests, please try again later." },
  skip: (req) => req.method === "OPTIONS", // Skip rate limiting for OPTIONS
});
app.use("/api/", limiter);

// Helmet security
app.use(helmet());

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Development logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "SolvSutra Super Admin API is running" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/plans", planRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/domains", domainRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/webhooks", webhookRoutes);

// Error handlers
app.use(notFound);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 5001;

// Seed initial data
async function seedData() {
  const User = require("./src/models/User");
  const Plan = require("./src/models/Plan");
  const Client = require("./src/models/Client");
  const Project = require("./src/models/Project");
  const Subscription = require("./src/models/Subscription");
  const { generateClientId, generateProjectId, generateSubscriptionId, generateApiKey, generateApiSecret } = require("./src/utils/generateIds");
  const { addDuration } = require("./src/utils/dateHelpers");

  try {
    // Create super admin if not exists
    const superAdminExists = await User.findOne({ role: "super_admin" });
    if (!superAdminExists) {
      await User.create({
        name: "SolvSutra Admin",
        email: "admin@solvsutra.com",
        password: "admin123",
        phone: "9876543210",
        role: "super_admin",
      });
      console.log("✅ Super Admin created: admin@solvsutra.com / admin123");
    }

    // Create default plans
    const plansCount = await Plan.countDocuments();
    if (plansCount === 0) {
      await Plan.insertMany([
        {
          planId: "PLN_FREE",
          name: "Free Yearly",
          description: "Free subscription for the first year",
          price: 0,
          currency: "INR",
          duration: 1,
          durationUnit: "year",
          features: ["Basic Features", "Email Support", "1 Project"],
          isFree: true,
          sortOrder: 1,
        },
        {
          planId: "PLN_STARTER",
          name: "Starter",
          description: "Perfect for small businesses",
          price: 5000,
          currency: "INR",
          duration: 1,
          durationUnit: "year",
          features: ["All Basic Features", "Priority Support", "3 Projects", "Basic Reports"],
          isFree: false,
          sortOrder: 2,
        },
        {
          planId: "PLN_BUSINESS",
          name: "Business",
          description: "For growing businesses",
          price: 15000,
          currency: "INR",
          duration: 1,
          durationUnit: "year",
          features: ["All Starter Features", "5 Projects", "Advanced Reports", "API Access", "Custom Integrations"],
          isFree: false,
          sortOrder: 3,
        },
        {
          planId: "PLN_PREMIUM",
          name: "Premium",
          description: "Enterprise solution",
          price: 30000,
          currency: "INR",
          duration: 1,
          durationUnit: "year",
          features: ["All Business Features", "Unlimited Projects", "Dedicated Support", "White Label", "SLA Guarantee"],
          isFree: false,
          sortOrder: 4,
        },
      ]);
      console.log("✅ Default plans created");
    }

    // Create demo client and project if none exist
    const clientCount = await Client.countDocuments();
    if (clientCount === 0) {
      const client = await Client.create({
        clientId: generateClientId(),
        companyName: "Demo Client Company",
        contactPerson: "John Doe",
        email: "demo@client.com",
        phone: "9876543210",
        address: "123 Business Street",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        gstNumber: "27AABCU9603R1ZM",
        status: "active",
      });

      const project = await Project.create({
        projectId: generateProjectId(),
        clientId: client._id,
        projectName: "Demo Project",
        description: "A demo project for testing",
        frontendUrl: "https://demo.example.com",
        adminUrl: "https://admin.demo.example.com",
        backendUrl: "https://api.demo.example.com",
        environment: "production",
        apiKey: generateApiKey(),
        apiSecret: generateApiSecret(),
        status: "active",
        techStack: "React, Node.js, MongoDB",
      });

      // Create a free subscription
      const freePlan = await Plan.findOne({ planId: "PLN_FREE" });
      const startDate = new Date();
      const expiryDate = addDuration(startDate, 1, "year");

      await Subscription.create({
        subscriptionId: generateSubscriptionId(),
        clientId: client._id,
        projectId: project._id,
        planId: freePlan._id,
        startDate,
        expiryDate,
        status: "active",
        gracePeriodDays: 7,
      });

      console.log("✅ Demo client, project, and subscription created");
    }

    // Start cron jobs
    runExpiryCron();
    console.log("✅ Cron jobs initialized");
  } catch (error) {
    console.error("❌ Seed error:", error.message);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 SolvSutra Super Admin API running on port ${PORT}`);
});

module.exports = app;
