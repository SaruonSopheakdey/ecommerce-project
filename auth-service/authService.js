require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';

const app = express();
app.use(cors());
app.use(express.json());

// User Database Schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['Admin', 'Customer'], default: 'Customer' }
});
const User = mongoose.model('User', UserSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/userdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB userdb'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'auth-service' });
});

// API 1: Registration
router.post('/register', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({ email: req.body.email, password: hashedPassword, role: req.body.role });
    await user.save();
    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API 2: Login
router.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const validPassword = await bcrypt.compare(req.body.password, user.password);
    if (!validPassword) return res.status(400).json({ message: "Wrong password" });

    // Create JWT Token containing the user's role
    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Support all proxy path variants
app.use('/api/auth', router);
app.use('/api', router);
app.use('/', router);

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));