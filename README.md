# Cloud-Native E-Commerce Microservices Architecture

A distributed, production-ready e-commerce backend built with **Node.js**, **Express**, **MongoDB**, **Docker Compose**, and an **API Gateway** implementing **JWT Authentication**, **Role-Based Access Control (RBAC)**, and **Round-Robin Load Balancing**.

---

## 🏛️ System Architecture

All client requests route through the centralized **API Gateway** on Port `8000`. The gateway directs traffic to dedicated microservices, each running its own independent MongoDB database domain.

```
                                  +-----------------------+
                                  |   Postman / Client    |
                                  +-----------+-----------+
                                              |
                                              v (Port 8000)
                               +-----------------------------+
                               |     API Gateway Service     |
                               +--------------+--------------+
                                              |
      +--------------------+------------------+-------------------+--------------------+
      |                    |                  |                   |                    |
      v (8001)             v (8003)           v (8004)            v (8005)             v (8002)
+-------------+      +-------------+    +---------------+    +------------+      +-------------+
|    Auth     |      |   Product   |    |   Inventory   |    |    Cart    |      |    Order    |
|   Service   |      |   Catalog   |    |    Service    |    |   Service  |      |   Service   |
+------+------+      +------+------+    +-------+-------+    +-----+------+      +------+------+
       |                    |                   |                  |                    |
       |                    |                   |                  |                    |
       |             +------+-------------------+                  |                    |
       |             |                                             |                    |
       |             v (8007 & 8017 - Load Balanced)               |                    |
       |      +--------------------------------+                   |                    |
       |      |     Review & Rating Service    |                   |                    |
       |      |  (Instance 1 & Instance 2)     |                   |                    |
       |      +---------------+----------------+                   |                    |
       |                      |                                    |                    |
       |                      v (8008)                             |                    |
       |             +---------------------------------+           |                    |
       |             |   Notification / Email Service  |           |                    |
       |             +----------------+----------------+           |                    |
       |                              |                            |                    |
+------v------------------------------v----------------------------v--------------------v------+
|                                  MongoDB Database (Port 27017)                               |
| (userdb | productdb | inventorydb | cartdb | orderdb | reviewdb | notificationdb)             |
+-----------------------------------------------------------------------------------------------+
```

---

## 👥 Service Breakdown & Responsibilities

| Role | Service | Port | Database | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Infrastructure** | **API Gateway** | `8000` | N/A | Reverse proxy, dynamic routing, round-robin load balancer. |
| **Core** | **Auth Service** | `8001` | `userdb` | User registration, login, bcrypt hashing, JWT issuance. |
| **Member 1** | **Product Catalog** | `8003` & `8013` | `productdb` | Product listings, CRUD items, multi-instance load balancing. |
| **Member 1** | **Inventory Service** | `8004` | `inventorydb` | Stock quantities, low stock detection, stock deduction. |
| **Member 2** | **Cart Service** | `8005` | `cartdb` | Add/remove items, update quantities, calculate cart totals. |
| **Member 2** | **Order Service** | `8002` | `orderdb` | Order placement, user order history. |
| **Member 3** | **Review & Rating Service** | `8007` & `8017` | `reviewdb` | Product reviews, 1-5 star ratings, aggregated statistics, multi-instance load balancing. |
| **Member 3** | **Notification Service** | `8008` | `notificationdb` | Order confirmation dispatch, status updates, email simulation engine. |

---

## 🚀 Key Architectural Highlights

1. **Fully Distributed Docker Containerization**
   * Every microservice contains its own `Dockerfile` using lightweight `node:22-alpine`.
   * Root `docker-compose.yml` orchestrates all 8 containers, networks, environment variables, and persistent MongoDB volumes.
2. **JWT Authentication & Complete RBAC**
   * Centralized JWT verification (`verifyToken`) and role validation (`requireRole('Admin')` / `requireRole('Customer')`).
   * Ownership checks: Customers can only modify/delete their own reviews, carts, and notifications.
3. **Database Connectivity & Full CRUD**
   * Schema validation, structured Mongoose models, and complete Create, Read, Update, Delete across all services.
4. **Functional Load Balancing for High-Traffic Services**
   * **Product Catalog Service**: Dual instances (`product-service-1` on port `8003`, `product-service-2` on port `8013`).
   * **Review & Rating Service**: Dual instances (`review-service-1` on port `8007`, `review-service-2` on port `8017`).
   * API Gateway distributes traffic round-robin, verified via terminal logs and `X-Served-By` response headers.

---

## 🛠️ Quick Start Guide

### Prerequisites
* [Docker](https://www.docker.com/) & Docker Compose
* [Node.js](https://nodejs.org/) v20+ (if running without Docker)
* [Postman](https://www.postman.com/)

### Running with Docker Compose (Recommended)
```bash
# Clone the repository
git clone https://github.com/SaruonSopheakdey/ecommerce-project.git
cd ecommerce-project

# Build and start all services in detached mode
docker compose up -d --build

# Check running containers status
docker compose ps
```

All microservices will be live and accessible via the API Gateway:
`http://localhost:8000` (or `http://<EC2-PUBLIC-IP>:8000`).

---

## 📡 API Endpoints Reference

### 1. API Gateway
| Method | Route | Description | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | System health and route inspection | Public |

### 2. Auth Service (`/api/auth`)
| Method | Route | Description | Payload |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register new user | `{"email": "...", "password": "...", "role": "Customer"\|"Admin"}` |
| `POST` | `/api/auth/login` | Login and receive JWT | `{"email": "...", "password": "..."}` |

### 3. Product Catalog Service (`/api/products`)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Get all products | Bearer Token |
| `POST` | `/api/products` | Create product | Bearer Token (Admin) |

### 4. Inventory Service (`/api/inventory`)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/inventory` | Initialize stock for a product | Bearer Token (Admin) |
| `GET` | `/api/inventory` | View all stock items | Bearer Token |
| `GET` | `/api/inventory/:productId` | View product stock level & status | Public / Bearer |
| `PUT` | `/api/inventory/:productId` | Update stock quantity | Bearer Token (Admin) |
| `POST` | `/api/inventory/:productId/deduct` | Deduct stock on order checkout | Bearer Token |
| `DELETE` | `/api/inventory/:productId` | Remove inventory item | Bearer Token (Admin) |

### 5. Cart Service (`/api/cart`)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cart` | View current user's cart | Bearer Token (Customer) |
| `POST` | `/api/cart/items` | Add item or increment quantity | Bearer Token (Customer) |
| `PUT` | `/api/cart/items/:productId`| Update item quantity (0 removes item) | Bearer Token (Customer) |
| `DELETE` | `/api/cart/items/:productId`| Remove specific item from cart | Bearer Token (Customer) |
| `DELETE` | `/api/cart` | Clear entire cart | Bearer Token (Customer) |
| `GET` | `/api/cart/user/:userId` | View user cart | Bearer Token (Admin / Owner) |

### 6. Order Service (`/api/orders`)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | Place a new order | Bearer Token |
| `GET` | `/api/orders` | View order history | Bearer Token |

### 7. Review & Rating Service (`/api/reviews` - Load Balanced)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/reviews` | Post review & rating (1-5) | Bearer Token (Customer) |
| `GET` | `/api/reviews` | View all reviews (`?productId=` / `?userId=`) | Public |
| `GET` | `/api/reviews/product/:productId` | Reviews for product + average rating | Public |
| `GET` | `/api/reviews/:id` | View single review | Public |
| `PUT` | `/api/reviews/:id` | Edit review | Bearer Token (Owner Only) |
| `DELETE` | `/api/reviews/:id` | Delete review | Bearer Token (Owner / Admin) |
| `GET` | `/api/reviews/health` | Health check + load balanced instance ID | Public |

### 8. Notification & Email Service (`/api/notifications`)
| Method | Route | Description | Auth / Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/notifications` | Send notification & trigger email dispatch | Bearer Token |
| `GET` | `/api/notifications` | View notifications (Customer=own, Admin=all) | Bearer Token |
| `GET` | `/api/notifications/user/:userId` | View user notifications | Bearer Token (Admin / Owner) |
| `GET` | `/api/notifications/:id` | View single notification | Bearer Token (Admin / Owner) |
| `PUT` | `/api/notifications/:id/read` | Mark notification as read | Bearer Token (Admin / Owner) |
| `DELETE` | `/api/notifications/:id` | Delete notification | Bearer Token (Admin / Owner) |

---

## 🧪 Testing & Verification Guide

### 1. Load Balancing Verification
Send two consecutive requests to:
```http
GET http://localhost:8000/api/reviews/health
```
* **Request 1 Response**: `"instanceId": "review-instance-8007"`, Header: `X-Served-By: review-instance-8007`
* **Request 2 Response**: `"instanceId": "review-instance-8017"`, Header: `X-Served-By: review-instance-8017`

And similarly for Product Catalog:
```http
GET http://localhost:8000/api/products/health
```
* **Request 1 Response**: `"instanceId": "product-instance-8003"`, Header: `X-Served-By: product-instance-8003`
* **Request 2 Response**: `"instanceId": "product-instance-8013"`, Header: `X-Served-By: product-instance-8013`
* **Gateway Console Log**: Displays round-robin routing between instances for both services.

### 2. Security & RBAC Test Cases (Required for Screenshots)
* **Wrong Password**:
  * `POST http://localhost:8000/api/auth/login` with incorrect password → `400 Bad Request` (`{"message": "Wrong password"}`)
* **Invalid / Expired Token**:
  * `GET http://localhost:8000/api/reviews` with `Authorization: Bearer invalidtoken123` → `400 Bad Request` (`{"message": "Invalid or Expired Token"}`)
* **Unauthorized Role Mismatch**:
  * `POST http://localhost:8000/api/products` using a Customer Token → `403 Forbidden` (`{"message": "Access Denied: Unauthorized Role"}`)
* **Missing Token**:
  * Any protected route without token → `401 Unauthorized` (`{"message": "Access Denied: No Token Provided"}`)

### 3. Inspecting MongoDB Collections
```bash
docker exec -it ecommerce-mongo mongosh
```
```javascript
use reviewdb
show collections
db.reviews.find().pretty()

use notificationdb
show collections
db.notifications.find().pretty()
```

---

## ☁️ Deployment on AWS EC2
1. Launch an **Ubuntu 24.04** instance on EC2.
2. Open Security Group Inbound Rule for **Port 8000** (`Custom TCP`, `0.0.0.0/0`).
3. Install Docker:
   ```bash
   sudo apt update && sudo apt install -y git docker.io docker-compose-v2
   sudo usermod -aG docker $USER
   newgrp docker
   ```
4. Clone repo and run:
   ```bash
   docker compose up -d --build
   ```
5. Test against your Public IPv4: `http://<EC2-PUBLIC-IP>:8000`.
