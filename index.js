const express = require('express');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(express.json()); // Để đọc dữ liệu JSON từ request body

// Khởi tạo Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert({
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    project_id: process.env.FIREBASE_PROJECT_ID,
  }),
});

const db = admin.firestore(); // Firestore database
const auth = admin.auth(); // Firebase Authentication

// Cấu hình email thông báo
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Middleware kiểm tra quyền admin
const checkAdmin = async (req, res, next) => {
  const user = await auth.verifyIdToken(req.headers.authorization);
  const userDoc = await db.collection('users').doc(user.uid).get();
  if (userDoc.exists && userDoc.data().role === 'admin') {
    next();
  } else {
    res.status(403).send('Access denied');
  }
};

// Đăng ký người dùng (Sign up)
app.post('/signup', async (req, res) => {
  const { email, password, displayName, role } = req.body;
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
    });
    await db.collection('users').doc(userRecord.uid).set({
      displayName,
      email,
      role: role || 'user', // Mặc định là user
    });
    res.status(201).send('User registered successfully');
  } catch (error) {
    res.status(500).send('Error creating user: ' + error.message);
  }
});

// Thêm khóa học (Admin)
app.post('/courses', checkAdmin, async (req, res) => {
  try {
    const course = req.body;
    const docRef = await db.collection('courses').add(course);
    res.status(201).send({ id: docRef.id, message: 'Course added successfully' });
  } catch (error) {
    res.status(500).send('Error adding course: ' + error.message);
  }
});

// Xem danh sách khóa học
app.get('/courses', async (req, res) => {
  try {
    const snapshot = await db.collection('courses').get();
    const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(courses);
  } catch (error) {
    res.status(500).send('Error fetching courses: ' + error.message);
  }
});

// Đăng ký khóa học (User)
app.post('/courses/:courseId/register', async (req, res) => {
  const { courseId } = req.params;
  const user = await auth.verifyIdToken(req.headers.authorization);
  try {
    await db.collection('registrations').add({
      userId: user.uid,
      courseId: courseId,
      registeredAt: new Date(),
    });
    // Gửi email thông báo
    const course = await db.collection('courses').doc(courseId).get();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `Registration for ${course.data().name} successful`,
      text: `You have successfully registered for the course ${course.data().name}.`,
    });
    res.status(201).send('Registered successfully');
  } catch (error) {
    res.status(500).send('Error registering for course: ' + error.message);
  }
});

// Thêm bài giảng (Admin)
app.post('/courses/:courseId/lectures', checkAdmin, async (req, res) => {
  const { courseId } = req.params;
  const lecture = req.body;
  try {
    const docRef = await db.collection('courses').doc(courseId).collection('lectures').add(lecture);
    res.status(201).send({ id: docRef.id, message: 'Lecture added successfully' });
  } catch (error) {
    res.status(500).send('Error adding lecture: ' + error.message);
  }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
