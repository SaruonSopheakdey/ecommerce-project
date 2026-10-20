require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8002;

// Middleware to extract user identity passed by the API Gateway
app.use((req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'] || null,
    role: req.headers['x-user-role'] || 'Customer',
    email: req.headers['x-user-email'] || ''
  };
  next();
});

const OrderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  productId: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  totalPrice: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', OrderSchema);

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/orderdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB orderdb'))
  .catch(err => console.error('MongoDB connection error:', err));

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'order-service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

router.post('/', async (req, res) => {
  try {
    const order = new Order({
      userId: req.user.id || req.body.userId || "user123",
      productId: req.body.productId,
      quantity: req.body.quantity,
      totalPrice: req.body.totalPrice
    });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Support both direct root access and Nginx /api/orders path
app.use('/api/orders', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
