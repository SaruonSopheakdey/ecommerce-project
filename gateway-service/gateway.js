const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 1. Auth Service (Port 8001)
app.use('/api/auth', createProxyMiddleware({ 
  target: process.env.AUTH_SERVICE_URL || 'http://localhost:8001', 
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/api' }
}));

// 2. Product Catalog Service (Port 8003 & 8013 - High-Traffic Round-Robin Load Balancing)
const productInstances = (process.env.PRODUCT_SERVICE_URLS || 'http://localhost:8003,http://localhost:8013').split(',');
let productTurn = 0;

app.use('/api/products', createProxyMiddleware({ 
  router: () => {
    const selectedTarget = productInstances[productTurn % productInstances.length].trim();
    console.log(`[API Gateway - Load Balancer] Forwarding /api/products request to instance: ${selectedTarget}`);
    productTurn++;
    return selectedTarget;
  },
  changeOrigin: true 
}));

// 3. Inventory Service (Port 8004)
app.use('/api/inventory', createProxyMiddleware({ 
  target: process.env.INVENTORY_SERVICE_URL || 'http://localhost:8004', 
  changeOrigin: true 
}));

// 4. Cart Service (Port 8005)
app.use('/api/cart', createProxyMiddleware({ 
  target: process.env.CART_SERVICE_URL || 'http://localhost:8005', 
  changeOrigin: true 
}));

// 5. Order Service (Port 8002)
app.use('/api/orders', createProxyMiddleware({ 
  target: process.env.ORDER_SERVICE_URL || 'http://localhost:8002', 
  changeOrigin: true 
}));

// 6. Review & Rating Service (Port 8007 & 8017 - High-Traffic Round-Robin Load Balancing)
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

// 7. Notification / Email Service (Port 8008)
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
    loadBalancedServices: {
      products: productInstances,
      reviews: reviewInstances
    },
    routes: {
      auth: process.env.AUTH_SERVICE_URL || 'http://localhost:8001',
      products: productInstances,
      inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:8004',
      cart: process.env.CART_SERVICE_URL || 'http://localhost:8005',
      orders: process.env.ORDER_SERVICE_URL || 'http://localhost:8002',
      reviews: reviewInstances,
      notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:8008'
    }
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));