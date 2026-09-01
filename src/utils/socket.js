const jwt = require("jsonwebtoken");

// Notifications aren't scoped to a specific admin user (the Notification
// model has no `userId` field — they're org-wide), so there's no per-user
// room to target. Every authenticated admin socket joins this one room and
// gets every new notification, mirroring what the REST list already shows
// any logged-in staff member.
const ADMIN_ROOM = "admins";

let io = null;

function initSocket(server) {
  const { Server } = require("socket.io");

  io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3000",
        "http://localhost:3001",
        process.env.FRONTEND_URL,
      ].filter(Boolean),
      credentials: true,
    },
  });

  // Same JWT the REST API's `protect` middleware verifies — a socket
  // connection carries the same admin session, not a separate credential.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Not authorized"));
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error("Token is invalid or expired"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(ADMIN_ROOM);
  });

  return io;
}

function getIO() {
  return io;
}

function emitNewNotification(notification) {
  io?.to(ADMIN_ROOM).emit("notification:new", notification);
}

module.exports = { initSocket, getIO, emitNewNotification };
