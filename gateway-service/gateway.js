const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 1. Auth Service
app.use('/api/auth', createProxyMiddleware({ 
  target: process.env.AUTH_SERVICE_URL || 'http://localhost:8001', 
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api' }
}));

// 2. Product Service
app.use('/api/products', createProxyMiddleware({ 
  target: process.env.PRODUCT_SERVICE_URL || 'http://localhost:8003', 
  changeOrigin: true 
}));

// 3. Order Service
app.use('/api/orders', createProxyMiddleware({ 
  target: process.env.ORDER_SERVICE_URL || 'http://localhost:8002', 
  changeOrigin: true 
}));

// 4. Review & Rating Service (Port 8007 & 8017 - Demonstrates Functional Load Balancing)
const reviewInstances = (process.env.REVIEW_SERVICE_URLS || 'http://localhost:8007,http://localhost:8017').split(',');
let reviewTurn = 0;

app.use('/api/reviews', createProxyMiddleware({ 
  router: () => {
    const selectedTarget = reviewInstances[reviewTurn % reviewInstances.length].trim();
    console.log(`[API Gateway - Load Balancer] Forwarding /api/reviews request to instance: ${selectedTarget}`);
    reviewTurn++;
    return selectedTarget;
  },
  changeOrigin: true 
}));

// 5. Notification / Email Service (Port 8008)
app.use('/api/notifications', createProxyMiddleware({ 
  target: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8008', 
  changeOrigin: true 
}));

// Gateway Health & Route Inspection
app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    routes: {
      auth: 'http://localhost:8001',
      products: 'http://localhost:8003',
      orders: 'http://localhost:8002',
      reviews: reviewInstances,
      notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8008'
    }
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));