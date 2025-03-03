const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2');
const nodemailer = require('nodemailer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ['websocket', 'polling'],
});

const PORT = 4001;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'funstaydb',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to the database.');
});

// WebSocket connection
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

// Route to handle the webhook and insert new enquiry
app.post('/website/webhook', (req, res) => {
  const {
    country_code,
    email,
    from_page,
    lastname,
    lead_source,
    message,
    mobile,
    name,
    package_id
  } = req.body;

  console.log('Received webhook data:', req.body);

  if (!mobile || !email || !name || !package_id) {
    return res.status(400).json({ error: "Required fields are missing" });
  }

  const query = `
    INSERT INTO website (country_code, email, from_page, lastname, lead_source, message, mobile, name, package_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(query, [
    country_code || null,
    email,
    from_page || null,
    lastname || null,
    lead_source || null,
    message || null,
    mobile,
    name,
    package_id
  ], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error" });
    }

    const newEnquiry = {
      id: result.insertId,
      country_code,
      email,
      from_page,
      lastname,
      lead_source,
      message,
      mobile,
      name,
      package_id
    };

    // Emit new enquiry to all connected WebSocket clients
    io.emit('new_enquiry', newEnquiry);

    res.status(201).json({ success: true, message: "Lead stored successfully", enquiry: newEnquiry });
  });
});

// Route to fetch all enquiries
app.get('/website/enquiries', (req, res) => {
  const query = 'SELECT * FROM website ORDER BY created_at DESC';

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching enquiries:', err);
      return res.status(500).json({ message: 'Error fetching enquiries' });
    }
    res.json(results);
  });
});

// Email Configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "uppalahemanth4@gmail.com",
    pass: "oimoftsgtwradkux",
  },
});

// Function to send an email when the server stops
const sendServerDownEmail = async (reason) => {
  try {
    await transporter.sendMail({
      from: '"Server Monitor" <uppalahemanth4@gmail.com>',
      to: "uppalahemanth4@gmail.com",
      subject: "🚨 Server Down Alert!",
      text: `Website webhook server at http://localhost:${PORT} has stopped.\nReason: ${reason}`,
    });
    console.log("Server down notification sent via email.");
  } catch (error) {
    console.error("Failed to send email:", error);
  }
};

// Handle Server Exit
const handleExit = async (reason) => {
  console.log(`Server is stopping... Reason: ${reason}`);
  await sendServerDownEmail(reason);
  db.end((err) => {
    if (err) console.error("Error closing DB connection:", err);
    process.exit(1);
  });
};

// Handle manual shutdown (Ctrl+C)
process.on("SIGINT", () => handleExit("Manual shutdown (Ctrl+C)"));
process.on("SIGTERM", () => handleExit("System termination"));
process.on("uncaughtException", async (err) => {
  console.error("Uncaught Exception:", err);
  await sendServerDownEmail(`Uncaught Exception: ${err.message}`);
  handleExit("Uncaught Exception");
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
