const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey123";

// Verify JWT Token
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access Denied: No Token Provided" });

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid or Expired Token" });
  }
};

// Enforce Role-Based Access Control (RBAC)
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Access Denied: Unauthorized Role" });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole, JWT_SECRET };
