const express = require('express');
const mongoose = require('mongoose');
const { verifyToken } = require('./authMiddleware');

const app = express();
app.use(express.json());

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

// Listens on root / (matches what the gateway forwards)
app.post('/', verifyToken, async (req, res) => {
  try {
    const order = new Order({
      userId: req.user.id || req.user._id || "user123",
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

app.get('/', verifyToken, async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(8002, () => console.log('Order Service running on port 8002'));