const mongoose = require("mongoose");
const dns = require("dns");

// Some Windows dev machines have a local DNS stub (127.0.0.1, often added by
// a VPN/network tool) that resolves plain A records but refuses SRV lookups
// — which an Atlas mongodb+srv:// URI needs to find its real cluster hosts.
// Only worth overriding for the +srv form; a local mongodb:// URI never
// needs SRV resolution and shouldn't have its DNS behavior changed.
if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;
