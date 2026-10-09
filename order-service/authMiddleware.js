const jwt = require('jsonwebtoken');
const JWT_SECRET = "supersecretkey123";

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

module.exports = { verifyToken, JWT_SECRET };