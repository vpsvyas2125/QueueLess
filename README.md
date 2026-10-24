# QueueLess — Smart Queue Management System

A web-based queue management system designed to simplify customer queue handling, reduce manual effort, and improve service efficiency.

QueueLess allows customers to generate queue tokens while administrators manage customer queues, operate service counters, monitor customer statuses, and view daily analytics through an admin dashboard.

---

## 🚀 Features

### 👥 Customer Features

* Generate queue tokens by entering customer details.
* Select the required service.
* Receive a unique token number.
* Track token status using the customer's token ID.

### 🔐 Admin Authentication

* Secure administrator login.
* Password verification using bcrypt.
* JWT-based authentication.
* Authentication token stored in an HttpOnly cookie.
* Session verification before accessing protected dashboard features.
* Admin logout functionality.

### 📋 Queue Management

* View customer queue records.
* Search customers.
* Filter customers by queue status.
* Update customer status.
* Assign customers to service counters.
* Remove customer records when necessary.

### 🏢 Service Counter Management

* Manage three service counters.
* Call the next waiting customer.
* Prevent a counter from serving multiple customers simultaneously.
* Display the customer currently being served at each counter.

### 📊 Analytics Dashboard

* View daily customer statistics.
* Monitor waiting, serving, completed, and skipped customers.
* Calculate average waiting time for customers with recorded call times.
* Identify the busiest hour based on token creation times.
* Compare service counter performance.

### 🗄️ Database

* Store customer queue records in MongoDB Atlas.
* Store service counter information.
* Generate sequential queue token numbers.
* Maintain customer status and timestamp information.

---

## 🛠️ Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express.js
* MongoDB Node.js Driver
* bcryptjs
* JSON Web Token (JWT)
* CORS
* dotenv

### Database

* MongoDB Atlas

### Deployment

* Frontend: Vercel (planned)
* Backend: Render (planned)
* Database: MongoDB Atlas

---

## 📁 Project Structure

The project uses separate frontend and backend folders.

```text
QueueLess/
│
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── admin.html
│   ├── admin.css
│   ├── admin.js
│   ├── login.js
│   └── ...
│
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   └── ...
│
└── README.md
```

**Note:** Adjust the example filenames to match your actual project structure. Never commit your `.env` file to a public repository.

---

## ⚙️ Prerequisites

Before running QueueLess locally, install or configure:

* Node.js and npm
* MongoDB Atlas account
* A modern web browser
* Visual Studio Code (recommended)

---

## 💻 Local Installation and Setup

### 1. Clone the Repository

If your project is hosted on GitHub:

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd QueueLess
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with your actual repository URL.

Alternatively, open your existing QueueLess project folder in VS Code.

### 2. Install Backend Dependencies

Open a terminal and navigate to the backend folder:

```bash
cd backend
npm install
```

Ensure that your `package.json` includes a start script:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

Preserve your existing dependencies and other scripts when making changes.

### 3. Configure Environment Variables

Create a `.env` file inside the backend folder.

Add the following variables:

```env
PORT=3000
DB_NAME=QueueLess

MONGODB_URI=YOUR_MONGODB_ATLAS_CONNECTION_STRING

ADMIN_USERNAME=YOUR_ADMIN_USERNAME
ADMIN_PASSWORD_HASH=YOUR_BCRYPT_PASSWORD_HASH

JWT_SECRET=YOUR_LONG_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS

FRONTEND_ORIGIN=http://127.0.0.1:5500
COOKIE_SECURE=false
```

Replace the placeholder values with your actual configuration.

**Security requirements:**

* Never share your real MongoDB connection string publicly.
* Never commit `.env` to GitHub.
* Use a strong, randomly generated JWT secret of at least 32 characters.
* Store a bcrypt password hash in `ADMIN_PASSWORD_HASH`, not the plain-text password.
* Use `COOKIE_SECURE=false` only for local HTTP development. Production requires HTTPS and appropriate secure cookie settings.

### 4. Start the Backend

From the backend folder, run:

```bash
npm start
```

The backend should connect to MongoDB Atlas and start listening on port 3000.

Test the health endpoint by opening:

```text
http://localhost:3000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "QueueLess API is running!"
}
```

### 5. Start the Frontend

Open the frontend folder in Visual Studio Code.

Use the Live Server extension to launch the frontend.

For local development, the frontend may be available at:

```text
http://127.0.0.1:5500
```

Make sure the backend CORS configuration allows the exact frontend origin.

### 6. Access the Admin Dashboard

Open the login page using the Live Server URL.

Sign in using the administrator credentials configured in the backend environment variables.

After successful authentication, the application should open the admin dashboard.

---

## 🔌 API Endpoints

The backend exposes the following API endpoints.

| Method | Endpoint                            | Access | Purpose                                    |
| ------ | ----------------------------------- | ------ | ------------------------------------------ |
| GET    | `/api/health`                       | Public | Check backend status                       |
| POST   | `/api/admin/login`                  | Public | Authenticate administrator                 |
| GET    | `/api/admin/session`                | Admin  | Verify administrator session               |
| POST   | `/api/admin/logout`                 | Public | Clear the authentication cookie            |
| POST   | `/api/queue`                        | Public | Generate a customer token                  |
| GET    | `/api/queue`                        | Admin  | Retrieve all queue records                 |
| GET    | `/api/queue/:id`                    | Public | Retrieve a customer's tracking information |
| PATCH  | `/api/queue/:id/status`             | Admin  | Update customer status                     |
| DELETE | `/api/queue/:id`                    | Admin  | Delete a customer record                   |
| GET    | `/api/counters`                     | Public | Retrieve service counter information       |
| POST   | `/api/counters/:counterNumber/next` | Admin  | Call the next waiting customer             |
| GET    | `/api/analytics`                    | Admin  | Retrieve daily queue analytics             |

**Note:** Public endpoints should return only the information needed by customers. Administrator-only endpoints must retain server-side authentication checks.

---

## 🔐 Security Considerations

QueueLess includes several authentication and security mechanisms:

* Password hash verification using bcrypt.
* JWT authentication with issuer and audience validation.
* HttpOnly authentication cookies.
* Server-side middleware protecting administrative operations.
* CORS origin restrictions.
* Request body size limits.
* Validation of customer IDs, queue statuses, and counter numbers.

Before production deployment:

* Use HTTPS.
* Configure secure authentication cookies correctly.
* Set CORS to allow only the deployed frontend origin.
* Keep all secrets in the hosting provider's environment variables.
* Protect MongoDB Atlas credentials and restrict database network access.
* Test session expiration, logout, and unauthorized access.
* Consider rate limiting and additional protections against automated login attempts.

---

## 🌐 Deployment Plan

QueueLess is intended to be deployed using the following architecture:

1. **Frontend:** Vercel
2. **Backend:** Render
3. **Database:** MongoDB Atlas

Before deployment:

* Confirm the frontend and backend work locally.
* Ensure the backend has a valid `npm start` command.
* Configure environment variables in the backend hosting dashboard.
* Update the frontend API URL to point to the deployed backend.
* Configure CORS for the production frontend domain.
* Enable secure cookies and HTTPS.
* Test all application features after deployment.

Hosting availability, pricing, and free-tier limitations depend on the provider's current policies.

---

## 🔮 Future Enhancements

Potential future improvements include:

* Live queue updates without manually refreshing the page.
* Estimated customer waiting times.
* QR-code-based token generation.
* Notifications when a customer's turn approaches.
* Improved mobile responsiveness.
* Multi-organization support.
* Enhanced analytics and reporting.
* Customer feedback and service ratings.

These features are planned possibilities and are not necessarily implemented in the current version.

---

## 🎯 Project Objective

The objective of QueueLess is to provide a simple, accessible, and efficient digital queue management solution that helps organizations manage customer flow, improve service coordination, and monitor operational performance.

---

## 👨‍💻 Author

**QueueLess — Smart Queue Management System**

Developed as a web application project using HTML, CSS, JavaScript, Node.js, Express.js, and MongoDB Atlas.

---

## 📄 License

Choose and add an appropriate open-source license before distributing this project publicly. If you do not intend to grant reuse rights yet, specify your intended terms before publishing the repository.
