require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { verifyToken, requireRole } = require('./authMiddleware');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8008;

// MongoDB Notification Schema
const NotificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  recipientEmail: { type: String, required: true },
  orderId: { type: String },
  type: { 
    type: String, 
    enum: ['ORDER_CONFIRMATION', 'STATUS_UPDATE', 'PROMOTION', 'ALERT'], 
    default: 'ORDER_CONFIRMATION' 
  },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: ['SENT', 'PENDING', 'FAILED'], default: 'SENT' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', NotificationSchema);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/notificationdb';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB notificationdb'))
  .catch(err => console.error('MongoDB connection error:', err));

// Email Dispatch Simulator (Production-like logging / Mailer hook)
const dispatchEmail = async ({ to, subject, message, type, orderId }) => {
  console.log('======================================================================');
  console.log('📧 [EMAIL DISPATCH ENGINE]');
  console.log(`To:        ${to}`);
  console.log(`Subject:   ${subject}`);
  console.log(`Type:      ${type}`);
  if (orderId) console.log(`Order ID:  ${orderId}`);
  console.log(`Body:      ${message}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Status:    250 OK - Message queued & delivered successfully`);
  console.log('======================================================================');
  return { delivered: true, sentAt: new Date() };
};

const router = express.Router();

// Health Check
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'notification-service',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Route 1: Create & Send Notification / Email (Authenticated)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { userId, recipientEmail, orderId, type, subject, message } = req.body;

    const targetUserId = userId || req.user.id || req.user._id;
    const targetEmail = recipientEmail || req.user.email;

    if (!targetEmail || !subject || !message) {
      return res.status(400).json({ error: "recipientEmail, subject, and message are required" });
    }

    // Trigger Email Dispatch
    await dispatchEmail({
      to: targetEmail,
      subject,
      message,
      type: type || 'ORDER_CONFIRMATION',
      orderId
    });

    const notification = new Notification({
      userId: targetUserId,
      recipientEmail: targetEmail,
      orderId,
      type: type || 'ORDER_CONFIRMATION',
      subject,
      message,
      status: 'SENT'
    });

    await notification.save();

    res.status(201).json({
      message: "Notification sent and logged successfully!",
      notification,
      emailDispatched: true
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 2: Get All Notifications (Admin gets all, Customer gets own)
router.get('/', verifyToken, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== 'Admin') {
      // Customer can only view their own notifications
      query.userId = req.user.id || req.user._id;
    }

    const notifications = await Notification.find(query).sort({ createdAt: -1 });
    res.json({
      total: notifications.length,
      role: req.user.role,
      notifications
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 3: Get Notifications for specific user (RBAC protected)
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const requestedUserId = req.params.userId;
    const currentUserId = req.user.id || req.user._id;

    // RBAC: Customer cannot view other users' notifications
    if (req.user.role !== 'Admin' && currentUserId !== requestedUserId) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to view notifications of another user" });
    }

    const notifications = await Notification.find({ userId: requestedUserId }).sort({ createdAt: -1 });
    res.json({
      userId: requestedUserId,
      total: notifications.length,
      notifications
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route 4: Get Notification by ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const currentUserId = req.user.id || req.user._id;
    if (req.user.role !== 'Admin' && notification.userId !== currentUserId) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to view this notification" });
    }

    res.json(notification);
  } catch (err) {
    res.status(400).json({ error: "Invalid notification ID format" });
  }
});

// Route 5: Mark Notification as Read
router.put('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const currentUserId = req.user.id || req.user._id;
    if (req.user.role !== 'Admin' && notification.userId !== currentUserId) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to update this notification" });
    }

    notification.read = true;
    await notification.save();

    res.json({
      message: "Notification marked as read",
      notification
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Route 6: Delete a Notification (Owner or Admin)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const currentUserId = req.user.id || req.user._id;
    if (req.user.role !== 'Admin' && notification.userId !== currentUserId) {
      return res.status(403).json({ message: "Access Denied: Unauthorized to delete this notification" });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.json({
      message: "Notification deleted successfully",
      notificationId: req.params.id
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Support both direct access and gateway-proxied paths
app.use('/api/notifications', router);
app.use('/', router);

app.listen(PORT, () => console.log(`Notification Service running on port ${PORT}`));
