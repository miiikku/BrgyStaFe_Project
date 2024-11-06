const express = require('express');
const bodyParser = require('body-parser');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config(); // Load .env file contents into process.env
const nodemailer = require('nodemailer');
const multer = require("multer");
const upload = multer({ dest: "public/uploads" }); // Specify the uploads folder
const cors = require('cors');
const validator = require('validator'); // Optional: only if you're using the validator package
const app = express();
const port = 8080;

const uri = "mongodb+srv://santafedasma:brgysantafedasmarinas@cluster0.uv9yo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const dbName = "BrgyStaFe";
let db;

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
      user: process.env.EMAIL_USER,     // Use the email from your environment variables
      pass: process.env.EMAIL_PASSWORD  // Use the password from your environment variables
  }
});

// Create payment link using Paymongo
const createPaymongoPaymentLink = async (amount, description) => {
    try {
        const response = await axios.post('https://api.paymongo.com/v1/links', {
            data: {
                attributes: {
                    amount: amount, // amount in centavos (e.g., 100.00 PHP = 10000 centavos)
                    description: description,
                    remarks: 'Barangay Santa Fe Document Payment'
                }
            }
        }, {
            headers: {
                'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.data.attributes.url; // The generated payment link
    } catch (error) {
        console.error('Error creating payment link:', error.response.data);
        throw error;
    }
};



// Define allowed origins
const allowedOrigins = [
  'http://localhost:8080', // Adjust port if different
  //'https://yourdomain.com' // Replace with your actual domain when deploying
];

// CORS configuration function
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Only allow requests from the specified origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true // Allow cookies to be sent with requests if needed
};

// Use CORS middleware with the defined options
app.use(cors(corsOptions));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 60000 } // 1 minute for example
}));

// Helper function to validate password strength
function isStrongPassword(password) {
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongPasswordRegex.test(password);
}

// Serve static files from the directories
app.use(express.static(path.join(__dirname, 'WELCOME')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'USER')));
app.use(express.static(path.join(__dirname, 'ADMIN')));

// Connect to MongoDB
MongoClient.connect(uri)
  .then(client => {
    db = client.db(dbName);
    console.log('Connected to MongoDB');

    // Start the server after successful connection
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  });

// Set up routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'WELCOME', 'welcome.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'WELCOME', 'login.html'));
});

// ADMIN LOGIN START
// Admin login
app.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const adminCollection = db.collection('admin');
    const user = await adminCollection.findOne({ username });

    if (!user) {
      return res.status(401).send('No account found');
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).send('Wrong password');
    }

    // Store role and username in session
    req.session.username = user.username;
    req.session.role = 'admin'; // Store 'admin' role in session
    res.redirect('/dashboard.html'); // Redirect to admin dashboard
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/admin-details-data', async (req, res) => {
  if (!req.session.username) {
    return res.status(401).send('Unauthorized: No user logged in');
  }

  try {
    const residentCollection = db.collection('resident');
    const resident = await residentCollection.findOne({ username: req.session.username });
    if (resident) {
      res.json(resident);
    } else {
      res.status(404).send('Resident not found');
    }
  } catch (err) {
    console.error('Error fetching admin details:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'ADMIN', 'dashboard.html'));
});

// Endpoint to get dashboard counts
app.get('/dashboard-counts', async (req, res) => {
  try {
      const residentCollection = db.collection('resident');

      const populationCount = await residentCollection.countDocuments();
      const seniorCount = await residentCollection.countDocuments({ age: { $gte: 60 } });
      const pwdCount = await residentCollection.countDocuments({ PWD_Senior: 'PWD' });

      res.json({
          population: populationCount,
          senior: seniorCount,
          pwd: pwdCount
      });
  } catch (err) {
      console.error('Error fetching dashboard counts:', err);
      res.status(500).send('Internal Server Error');
  }
});

app.get('/dashboard-data', async (req, res) => {
  try {
      const residentCollection = db.collection('resident');
      
      const population = await residentCollection.countDocuments();
      const seniors = await residentCollection.countDocuments({ 'PWD/Senior': 'Senior' });
      const pwds = await residentCollection.countDocuments({ 'PWD/Senior': 'PWD' });

      res.json({ population, seniors, pwds });
  } catch (err) {
      console.error('Error fetching dashboard data:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Admin Forgot Password: Check if username exists
app.post('/admin-forgot-password', async (req, res) => {
  const { username } = req.body;
  const adminCollection = db.collection('admin');
  
  try {
    const user = await adminCollection.findOne({ username });
    
    if (user) {
      res.status(200).send('Admin username found. Please set your new password.');
    } else {
      res.status(404).send('Admin username not found.');
    }
  } catch (err) {
    console.error('Error checking admin username:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Admin Reset Password: Update the password
app.post('/admin-reset-password', async (req, res) => {
  const { username, newPassword } = req.body;
  const adminCollection = db.collection('admin');
  
  // Check password strength
  if (!isStrongPassword(newPassword)) {
    return res.status(400).send('Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.');
  }

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update the admin's password in the database
    const result = await adminCollection.updateOne(
      { username },
      { $set: { password: hashedPassword } }
    );
    
    if (result.modifiedCount > 0) {
      res.status(200).send('Password reset successfully.');
    } else {
      res.status(404).send('Error resetting admin password.');
    }
  } catch (err) {
    console.error('Error resetting admin password:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ADMIN LOGIN END


// USER/RESIDENT LOGIN/LOGOUT START
// Hash password during signup
app.post('/signup', async (req, res) => {
  const { password, 'confirm-password': confirmPassword } = req.body;

  // Check password strength
  if (!isStrongPassword(password)) {
    return res.status(400).send('Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.');
  }

  if (password !== confirmPassword) {
    return res.status(400).send('Passwords do not match');
  }
  
  const { firstname, middlename, lastname, username, email } = req.body;

  try {
    const residentsCollection = db.collection('resident');
    const userAccountsCollection = db.collection('user-account');

    // Check if resident exists by matching first name, middle name, and last name
    const resident = await residentsCollection.findOne({
      Firstname: { $regex: new RegExp(`^${firstname}$`, 'i') },
      Middlename: { $regex: new RegExp(`^${middlename}$`, 'i') },
      Lastname: { $regex: new RegExp(`^${lastname}$`, 'i') }
    });

    if (resident) {
      // Check if the username already exists in 'user-account' collection
      const existingUser = await userAccountsCollection.findOne({ username: new RegExp(`^${username}$`, 'i') });

      if (existingUser) {
        return res.status(400).send('An account with this username already exists.');
      }

      // Hash the password before saving it
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Save the user account with hashed password in the 'user-account' collection
      await userAccountsCollection.insertOne({
        firstname, middlename, lastname, username, password: hashedPassword
      });

      // Save the email to the 'resident' collection under "e-mail"
      await residentsCollection.updateOne(
        {
          Firstname: { $regex: new RegExp(`^${firstname}$`, 'i') },
          Middlename: { $regex: new RegExp(`^${middlename}$`, 'i') },
          Lastname: { $regex: new RegExp(`^${lastname}$`, 'i') }
        },
        { $set: { 'e-mail': email } } // Set the email under "e-mail"
      );

      return res.status(200).send('Account created successfully');
    } else {
      return res.status(404).send('No resident name found');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


// Resident login
app.post('/resident-login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const userAccountCollection = db.collection('user-account');
    const user = await userAccountCollection.findOne({ username });

    if (!user) {
      return res.status(401).send('No account found');
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).send('Wrong password');
    }

    // Store role and username in session
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.role = 'user'; // Store 'user' role in session
    res.status(200).send('Login successful');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/offices.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'USER', 'offices.html'));
});

// Routes accessible only to regular users
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'USER', 'home.html'));
});

app.get('/request-document.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'USER', 'request-document.html'));
});

app.get('/user-details', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const userAccountCollection = db.collection('user-account');
    const user = await userAccountCollection.findOne({ _id: new ObjectId(req.session.userId) });
    
    if (user) {
      res.json(user);
    } else {
      res.status(404).send('User not found');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/user-profile.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'USER', 'user-profile.html'));
});

app.get('/user-profile-data', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const userAccountCollection = db.collection('user-account');
    const residentCollection = db.collection('resident');

    // Fetch the logged-in user by username stored in session
    const userAccount = await userAccountCollection.findOne({ _id: new ObjectId(req.session.userId) });

    if (!userAccount) {
      return res.status(404).send('User account not found');
    }

    // Now fetch the resident details using the username field
    const resident = await residentCollection.findOne({ username: userAccount.username });

    if (!resident) {
      return res.status(404).send('Resident not found');
    }

    // Respond with the resident data to populate the profile
    res.json(resident);
  } catch (err) {
    console.error('Error fetching user profile data:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Could not log out.');
    } else {
      res.redirect('/');
    }
  });
});
// USER/RESIDENT LOGIN/LOGOUT END

// USER FORGOT PASSWORD
// Route to check if username exists and allow password reset
app.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  const userAccountCollection = db.collection('user-account');
  
  try {
    const user = await userAccountCollection.findOne({ username });
    
    if (user) {
      res.status(200).send('Username found. Please set your new password.');
    } else {
      res.status(404).send('Username not found.');
    }
  } catch (err) {
    console.error('Error checking username:', err);
    res.status(500).send('Internal Server Error');
  }
});


// Route to update the password
app.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;
  const userAccountCollection = db.collection('user-account');
  
  // Check password strength
  if (!isStrongPassword(newPassword)) {
    return res.status(400).send('Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.');
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    const result = await userAccountCollection.updateOne(
      { username },
      { $set: { password: hashedPassword } }
    );
    
    if (result.modifiedCount > 0) {
      res.status(200).send('Password reset successfully.');
    } else {
      res.status(404).send('Error resetting password.');
    }
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).send('Internal Server Error');
  }
});

/************************ USER SIDE START ************************/ 

// REQUEST-DOCUMENT-CERT.HTML
app.post('/add-request-document-cert', async (req, res) => {
  const newRequest = {
    ...req.body,
    status: 'Processing', // Set default status to 'Processing'
  };

  try {
    const requestsCollection = db.collection('request-certification');
    const result = await requestsCollection.insertOne(newRequest);
    const savedRequest = await requestsCollection.findOne({ _id: result.insertedId });
    res.status(200).send({ success: true, request: savedRequest });
  } catch (err) {
    console.error('Error adding request:', err);
    res.status(500).send({ success: false });
  }
});

// REQUEST-DOCUMENT-CLEAR.HTML
app.post('/add-request-document-clear', async (req, res) => {
  const newRequest = {
    ...req.body,
    status: 'Processing', // Set default status to 'Processing'
  };

  try {
    const requestsCollection = db.collection('request-clearance');
    const result = await requestsCollection.insertOne(newRequest);
    const savedRequest = await requestsCollection.findOne({ _id: result.insertedId });
    res.status(200).send({ success: true, request: savedRequest });
  } catch (err) {
    console.error('Error adding request:', err);
    res.status(500).send({ success: false });
  }
});

// REQUEST-DOCUMENT-INDI.HTML
app.post('/add-request-indigency', async (req, res) => {
  const newRequest = {
    ...req.body,
    status: 'Processing', // This line ensures that the status is added
  };

  try {
    const requestsCollection = db.collection('request-indigency');
    const result = await requestsCollection.insertOne(newRequest);
    const savedRequest = await requestsCollection.findOne({ _id: result.insertedId });
    res.status(200).send({ success: true, request: savedRequest });
  } catch (err) {
    console.error('Error adding request:', err);
    res.status(500).send({ success: false });
  }
});


/************************ USER SIDE END ************************/ 



/************************ ADMIN SIDE START ************************/ 

app.get('/user-accounts', async (req, res) => {
  try {
    const userAccountCollection = db.collection('user-account');
    const userAccounts = await userAccountCollection.find().toArray();
    res.json(userAccounts);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/user-accounts', async (req, res) => {
  const { firstname, middlename, lastname, username, password } = req.body;

  try {
    const residentsCollection = db.collection('resident');
    const userAccountCollection = db.collection('user-account');

    // Query to find resident by first, middle, and last name (case-insensitive)
    const query = {
      'Firstname': { $regex: new RegExp(`^${firstname}$`, 'i') },
      'Lastname': { $regex: new RegExp(`^${lastname}$`, 'i') }
    };

    if (middlename) {
      query.Middlename = { $regex: new RegExp(`^${middlename}$`, 'i') };
    }

    // Check if the resident exists
    const resident = await residentsCollection.findOne(query);

    if (!resident) {
      return res.status(404).send('Resident not found');
    }

    // Check if the username already exists in the user-account collection
    const existingUser = await userAccountCollection.findOne({ username });

    if (existingUser) {
      return res.status(400).send('Username already exists. Please choose a different username.');
    }

    // Hash the password before saving it
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Prepare the new user account object with hashed password
    const newUserAccount = {
      firstname,
      middlename,
      lastname,
      username,
      password: hashedPassword
    };

    // Insert the new user account in the user-account collection
    await userAccountCollection.insertOne(newUserAccount);

    // Update the resident collection with the username
    await residentsCollection.updateOne(query, {
      $set: { username: newUserAccount.username }
    });

    res.status(200).send('User account added successfully and resident updated with username');
  } catch (err) {
    console.error('Error adding user account:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/check-username', async (req, res) => {
    const username = req.query.username;

    try {
        const userAccountCollection = db.collection('user-account'); // or whatever collection you're using
        const user = await userAccountCollection.findOne({ username });
        
        // Return true if user exists, false otherwise
        res.json({ exists: !!user }); // Sends { exists: true } if user found, { exists: false } otherwise
    } catch (error) {
        console.error('Error checking username:', error);
        res.status(500).json({ error: 'Error checking username.' }); // Send JSON error response
    }
});

app.delete('/user-accounts/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const userAccountCollection = db.collection('user-account');
    await userAccountCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send('User account deleted successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin-accounts', async (req, res) => {
  const { firstname, middlename, lastname, username, password } = req.body;
  
  try {
    const residentsCollection = db.collection('resident');
    const adminAccountCollection = db.collection('admin');
    
    // Check if the resident exists (case-insensitive check)
    const resident = await residentsCollection.findOne({
      'Firstname': new RegExp(`^${firstname}$`, 'i'),
      'Lastname': new RegExp(`^${lastname}$`, 'i')
    });

    if (!resident) {
      return res.status(404).send('Resident not found');
    }

    // Check if the username already exists in the admin collection (case-insensitive)
    const existingAccount = await adminAccountCollection.findOne({
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    });

    if (existingAccount) {
      return res.status(409).send('Username already exists');
    }

    // Hash the password before saving it
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const newAdminAccount = {
      firstname,
      middlename,
      lastname,
      username,
      password: hashedPassword
    };

    // Insert new admin account if the username does not exist
    await adminAccountCollection.insertOne(newAdminAccount);

    // Update the resident collection with the username
    await residentsCollection.updateOne(
      {
        'Firstname': new RegExp(`^${firstname}$`, 'i'),
        'Lastname': new RegExp(`^${lastname}$`, 'i')
      },
      { $set: { username } }
    );

    res.status(200).send('Admin account added successfully and resident updated with username');
  } catch (err) {
    console.error('Error adding admin account:', err);
    res.status(500).send('Internal Server Error');
  }
});



// Check Duplicate for username admin
// Endpoint to check if the username already exists in the admin collection (official accounts)
app.get('/check-username-official', async (req, res) => {
  const username = req.query.username;

  try {
    const adminCollection = db.collection('admin'); // Admin collection that handles official accounts
    
    // Search for the username in the admin collection (case-insensitive)
    const user = await adminCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    
    // If user exists, return true, otherwise false
    if (user) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error('Error checking username:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.delete('/admin-accounts/:id',  async (req, res) => {
  const id = req.params.id;
  try {
    const adminCollection = db.collection('admin');
    await adminCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send('Admin account deleted successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/admin-accounts', async (req, res) => {
  try {
    const adminCollection = db.collection('admin');
    const adminAccounts = await adminCollection.find().toArray();
    res.json(adminAccounts);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/residents', async (req, res) => {
  try {
      const residentCollection = db.collection('resident');
      const residents = await residentCollection.find().toArray();
      res.json(residents);
  } catch (err) {
      console.error('Error fetching residents:', err);
      res.status(500).send('Internal Server Error');
  }
});


app.get('/residents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const residentCollection = db.collection('resident');
    const userAccountCollection = db.collection('user-account');
    const adminAccountCollection = db.collection('admin');

    // Find the resident by ID
    const resident = await residentCollection.findOne({ _id: new ObjectId(id) });

    if (resident) {
      // Check if the resident exists in the user-account collection
      const userAccount = await userAccountCollection.findOne({
        firstname: { $regex: new RegExp(`^${resident.Firstname}$`, 'i') },
        middlename: { $regex: new RegExp(`^${resident.Middlename}$`, 'i') },
        lastname: { $regex: new RegExp(`^${resident.Lastname}$`, 'i') }
      });

      // Check if the resident exists in the admin collection
      const adminAccount = await adminAccountCollection.findOne({
        firstname: { $regex: new RegExp(`^${resident.Firstname}$`, 'i') },
        middlename: { $regex: new RegExp(`^${resident.Middlename}$`, 'i') },
        lastname: { $regex: new RegExp(`^${resident.Lastname}$`, 'i') }
      });

      // Add username to the resident object if found
      let username = null;
      if (userAccount) {
        username = userAccount.username;
      } else if (adminAccount) {
        username = adminAccount.username;
      }

      // Return the resident details along with the username (if found)
      res.json({ ...resident, username });
    } else {
      res.status(404).send('Resident not found');
    }
  } catch (err) {
    console.error('Error fetching resident details:', err);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/residents', async (req, res) => {
  const newResident = {
    Profilepic: req.body.Profilepic,
    Firstname: req.body.Firstname,
    Middlename: req.body.Middlename,
    Lastname: req.body.Lastname,
    birthdate: req.body.birthdate,
    age: req.body.age,
    gender: req.body.gender,
    civilstatus: req.body.civilstatus,
    "PWD/Senior": req.body["PWD/Senior"],
    "Voter Status": req.body["Voter Status"],
    "Contact Number": req.body["Contact Number"],
    Address: req.body.Address,
    startDate: req.body.startDate,
    yearsresiding: req.body.yearsresiding,
    "e-mail": req.body["e-mail"] // Change the key here to "e-mail"
};

  console.log(newResident);  // Debug log to verify data before MongoDB insertion

  try {
      const residentCollection = db.collection('resident');
      await residentCollection.insertOne(newResident);
      res.status(200).send('Resident added successfully');
  } catch (err) {
      console.error('Error adding resident:', err);
      res.status(500).send('Internal Server Error');
  }
});



app.put('/residents/:id', async (req, res) => {
  const id = req.params.id;
  const updatedResident = {
    Profilepic: req.body.Profilepic,
    Firstname: req.body.Firstname,
    Middlename: req.body.Middlename,
    Lastname: req.body.Lastname,
    birthdate: req.body.birthdate,
    age: req.body.age,
    gender: req.body.gender,
    civilstatus: req.body.civilstatus,
    "PWD/Senior": req.body["PWD/Senior"],
    "Voter Status": req.body["Voter Status"],
    "Contact Number": req.body["Contact Number"],
    Address: req.body.Address,
    startDate: req.body.startDate,
    yearsresiding: req.body.yearsresiding,
    "e-mail": req.body["e-mail"] 
  };

  try {
    const residentCollection = db.collection('resident');
    await residentCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedResident });
    res.status(200).send('Resident updated successfully');
  } catch (err) {
    console.error('Error updating resident:', err);
    res.status(500).send('Internal Server Error');
  }
});



app.delete('/residents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const residentCollection = db.collection('resident');
    await residentCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send('Resident deleted successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/barangay-ids', async (req, res) => {
  try {
    const barangayIdCollection = db.collection('barangay-id');
    const barangayIds = await barangayIdCollection.find().toArray();
    res.json(barangayIds);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/barangay-ids/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const barangayIdCollection = db.collection('barangay-id');
    const barangayId = await barangayIdCollection.findOne({ _id: new ObjectId(id) });
    res.json(barangayId);
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/barangay-ids', async (req, res) => {
  const newBarangayId = req.body;
  try {
      const barangayIdCollection = db.collection('barangay-id');
      await barangayIdCollection.insertOne(newBarangayId);
      res.status(200).send('Barangay ID added successfully');
  } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
  }
});

app.put('/barangay-ids/:id', async (req, res) => {
  const id = req.params.id;
  const updatedBarangayId = req.body;
  try {
      const barangayIdCollection = db.collection('barangay-id');
      await barangayIdCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedBarangayId });
      res.status(200).send('Barangay ID updated successfully');
  } catch (err) {
      console.error(err);
      res.status(500).send('Internal Server Error');
  }
});

app.delete('/barangay-ids/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const barangayIdCollection = db.collection('barangay-id');
    await barangayIdCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send('Barangay ID deleted successfully');
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

app.put('/barangay-ids/transfer/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const barangayIdCollection = db.collection('barangay-id');
      const barangayIdCompleteCollection = db.collection('barangay-id-complete');
      
      // Find the document to transfer
      const barangayId = await barangayIdCollection.findOne({ _id: new ObjectId(id) });
      if (!barangayId) {
          return res.status(404).send('Barangay ID not found');
      }
      
      // Insert the document into barangay-id-complete
      await barangayIdCompleteCollection.insertOne(barangayId);
      
      // Delete the document from barangay-id
      await barangayIdCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send('Barangay ID transferred successfully');
  } catch (err) {
      console.error('Error transferring barangay ID:', err);
      res.status(500).send('Internal Server Error');
  }
});

app.get('/barangay-ids-complete', async (req, res) => {
  try {
      const barangayIdCompleteCollection = db.collection('barangay-id-complete');
      const barangayIds = await barangayIdCompleteCollection.find().toArray();
      res.json(barangayIds);
  } catch (err) {
      console.error('Error fetching complete barangay IDs:', err);
      res.status(500).send('Internal Server Error');
  }
});

app.post('/submit-request', async (req, res) => {
  const newRequest = req.body;
  try {
      const userAccountCollection = db.collection('user-account');
      const user = await userAccountCollection.findOne({ _id: new ObjectId(req.session.userId) });

      if (user.firstname !== newRequest.firstName || user.middlename !== newRequest.middleName || user.lastname !== newRequest.lastName) {
          return res.status(400).send('You can only request documents for yourself.');
      }

      const requestsCollection = db.collection('requests');
      await requestsCollection.insertOne(newRequest);
      res.status(200).send('Request submitted successfully');
  } catch (err) {
      console.error('Error submitting request:', err);
      res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR REQUEST-CERTIFICATION
app.get('/fetch-certification-requests', async (req, res) => {
  try {
      const requestsCollection = db.collection('request-certification');
      const requests = await requestsCollection.find().toArray();
      res.json(requests);
  } catch (err) {
      console.error('Error fetching requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

  // for add request-cert
  app.post('/add-request-certification', async (req, res) => {
    const newRequest = req.body;

    try {
        const requestsCollection = db.collection('request-certification');
        const result = await requestsCollection.insertOne(newRequest);
        const savedRequest = await requestsCollection.findOne({ _id: result.insertedId });
        res.status(200).send({ success: true, request: savedRequest });
    } catch (err) {
        console.error('Error adding request:', err);
        res.status(500).send({ success: false });
    }
});

  //for edit req cert
// Fetch a specific certification request by ID
app.get('/fetch-certification-request/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const requestsCollection = db.collection('request-certification');
      const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
      res.json(request);
  } catch (err) {
      console.error('Error fetching request:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Update a specific certification request by ID
app.put('/update-request-certification/:id', async (req, res) => {
  const id = req.params.id;
  const updatedRequest = req.body;
  try {
      const requestsCollection = db.collection('request-certification');
      await requestsCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedRequest });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error updating request:', err);
      res.status(500).send({ success: false });
  }
});

// Delete a request-certification
app.delete('/delete-request-certification/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const requestsCollection = db.collection('request-certification');
      await requestsCollection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error deleting request:', err);
      res.status(500).send({ success: false });
  }
});

// Route to transfer request from request-certification to request-certification-complete
app.put('/transfer-request-certification/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const requestsCollection = db.collection('request-certification');
      const completedCollection = db.collection('request-certification-complete');
      
      // Find the document to transfer
      const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
      if (!request) {
          return res.status(404).send('Request not found');
      }
      
      // Insert the document into request-certification-complete
      await completedCollection.insertOne(request);
      
      // Delete the document from request-certification
      await requestsCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send('Request transferred successfully');
  } catch (err) {
      console.error('Error transferring request:', err);
      res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR REQUEST-CERTIFICATION-COMPLETE
app.get('/fetch-certification-requests-complete', async (req, res) => {
  try {
      const completedCollection = db.collection('request-certification-complete');
      const requests = await completedCollection.find().toArray();
      res.json(requests);
  } catch (err) {
      console.error('Error fetching completed requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR CLEARANCE-REQUEST
// Route to fetch all request-clearance data
app.get('/fetch-clearance-requests', async (req, res) => {
  try {
      const clearanceCollection = db.collection('request-clearance');
      const clearanceRequests = await clearanceCollection.find().toArray();
      res.json(clearanceRequests);
  } catch (err) {
      console.error('Error fetching clearance requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Add a new request-clearance
app.post('/add-request-clearance', async (req, res) => {
  const newRequest = req.body;

  try {
      const clearanceCollection = db.collection('request-clearance');
      const result = await clearanceCollection.insertOne(newRequest);
      const savedRequest = await clearanceCollection.findOne({ _id: result.insertedId });
      res.status(200).send({ success: true, request: savedRequest });
  } catch (err) {
      console.error('Error adding request:', err);
      res.status(500).send({ success: false });
  }
});

// Update a specific request-clearance by ID
app.get('/fetch-clearance-request/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const clearanceCollection = db.collection('request-clearance');
      const request = await clearanceCollection.findOne({ _id: new ObjectId(id) });
      if (request) {
          res.json(request);
      } else {
          res.status(404).send('Request not found');
      }
  } catch (err) {
      console.error('Error fetching request:', err);
      res.status(500).send('Internal Server Error');
  }
});

app.put('/update-request-clearance/:id', async (req, res) => {
  const id = req.params.id;
  const updatedRequest = req.body;

  try {
    const clearanceCollection = db.collection('request-clearance');
    await clearanceCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedRequest });
    res.status(200).send({ success: true });
  } catch (err) {
    console.error('Error updating request:', err);
    res.status(500).send({ success: false });
  }
});

// Delete a request-clearance by ID
app.delete('/delete-request-clearance/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const clearanceCollection = db.collection('request-clearance');
    await clearanceCollection.deleteOne({ _id: new ObjectId(id) });
    res.status(200).send({ success: true });
  } catch (err) {
    console.error('Error deleting request:', err);
    res.status(500).send({ success: false });
  }
});

// Transfer a request-clearance by ID
app.put('/transfer-request-clearance/:id', async (req, res) => {
  const id = req.params.id;

  try {
      const clearanceCollection = db.collection('request-clearance');
      const completedCollection = db.collection('request-clearance-complete');

      // Find the document to transfer
      const request = await clearanceCollection.findOne({ _id: new ObjectId(id) });
      if (!request) {
          return res.status(404).send('Request not found');
      }

      // Insert the document into the request-clearance-complete collection
      await completedCollection.insertOne(request);

      // Delete the document from the request-clearance collection
      await clearanceCollection.deleteOne({ _id: new ObjectId(id) });

      // Send a success response
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error transferring request:', err);
      res.status(500).send({ success: false });
  }
});

// BAGONG LAGAY KAY CLEARANCE REQUEST COMPLETE
// Fetch all completed request-clearance data
app.get('/fetch-clearance-requests-complete', async (req, res) => {
  try {
      const clearanceCompleteCollection = db.collection('request-clearance-complete');
      const clearanceRequestsComplete = await clearanceCompleteCollection.find().toArray();
      res.json(clearanceRequestsComplete);
  } catch (err) {
      console.error('Error fetching completed clearance requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR REQUEST-INDIGENCY
// Route to fetch all request-indigency data
app.get('/fetch-indigency-requests', async (req, res) => {
  try {
      const indigencyCollection = db.collection('request-indigency');
      const indigencyRequests = await indigencyCollection.find().toArray();
      res.json(indigencyRequests);
  } catch (err) {
      console.error('Error fetching indigency requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

// ADDING NEW INDIGENCY REQ
app.post('/add-request-indigency', async (req, res) => {
  const newRequest = req.body;

  try {
      const indigencyCollection = db.collection('request-indigency');
      const result = await indigencyCollection.insertOne(newRequest);
      const savedRequest = await indigencyCollection.findOne({ _id: result.insertedId });
      res.status(200).send({ success: true, request: savedRequest });
  } catch (err) {
      console.error('Error adding request:', err);
      res.status(500).send({ success: false });
  }
});

// EDIT INDIGENCY REQ
// Fetch a single request for editing
app.get('/fetch-indigency-request/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const requestsCollection = db.collection('request-indigency');
      const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
      res.json(request);
  } catch (err) {
      console.error('Error fetching request:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Update a specific indigency request
app.put('/update-request-indigency/:id', async (req, res) => {
  const id = req.params.id;
  const updatedRequest = req.body;
  try {
      const requestsCollection = db.collection('request-indigency');
      const result = await requestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedRequest }
      );
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error updating request:', err);
      res.status(500).send({ success: false });
  }
});

// DELETE INDIGENCY REQ
// Delete a request-indigency by ID
app.delete('/delete-request-indigency/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const requestsCollection = db.collection('request-indigency');
      await requestsCollection.deleteOne({ _id: new ObjectId(id) });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error deleting request:', err);
      res.status(500).send({ success: false });
  }
});

// TRANSFER COMPLETE INDIGENCY REQ
// Route to transfer request from request-indigency to request-indigency-complete
app.put('/transfer-request-indigency/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const indigencyCollection = db.collection('request-indigency');
      const indigencyCompleteCollection = db.collection('request-indigency-complete');

      // Find the document to transfer
      const request = await indigencyCollection.findOne({ _id: new ObjectId(id) });
      if (!request) {
          return res.status(404).send('Request not found');
      }

      // Insert the document into request-indigency-complete
      await indigencyCompleteCollection.insertOne(request);

      // Delete the document from request-indigency
      await indigencyCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error transferring request:', err);
      res.status(500).send({ success: false, message: 'Internal Server Error' });
    }
});

// BAGONG LAGAY FOR REQUEST-INDIGENCY COMPLETE
app.get('/fetch-indigency-requests-complete', async (req, res) => {
  try {
      const indigencyCompleteCollection = db.collection('request-indigency-complete');
      const indigencyRequestsComplete = await indigencyCompleteCollection.find().toArray();
      res.json(indigencyRequestsComplete);
  } catch (err) {
      console.error('Error fetching completed indigency requests:', err);
      res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR BLOTTER
// fetch blotter data
app.get('/fetch-blotter', async (req, res) => {
  try {
    const blotterCollection = db.collection('blotter');
    const moduleCollection = db.collection('module'); // Assuming 'module' stores the people (e.g., 'Imbestigador')

    // Fetch blotter data with justiceOnDuty populated
    const blotters = await blotterCollection.aggregate([
      {
        $lookup: {
          from: 'module', // module collection where the justiceOnDuty data is stored
          localField: 'justiceOnDuty', // local field in blotter collection that stores the ObjectId
          foreignField: '_id', // the field in module collection to match with
          as: 'justiceOnDutyDetails' // output array field with joined data
        }
      },
      {
        $unwind: { 
          path: '$justiceOnDutyDetails', 
          preserveNullAndEmptyArrays: true // in case there are blotters without a justiceOnDuty yet
        }
      },
      {
        $addFields: {
          justiceOnDutyName: {
            $concat: ['$justiceOnDutyDetails.firstName', ' ', '$justiceOnDutyDetails.lastName']
          }
        }
      }
    ]).toArray();

    res.json(blotters); // send back the updated blotter list with justiceOnDutyName populated
  } catch (err) {
    console.error('Error fetching blotter data:', err);
    res.status(500).send('Internal Server Error');
  }
});



// fetch kasunduan data
app.get('/fetch-kasunduan', async (req, res) => {
  try {
    const kasunduanCollection = db.collection('blotter-kasunduan');
    const kasunduanData = await kasunduanCollection.find().toArray();
    res.json(kasunduanData);
  } catch (err) {
    console.error('Error fetching kasunduan data:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Add a new blotter
app.post('/add-blotter', async (req, res) => {
  const newBlotter = req.body;
  
  try {
      const blotterCollection = db.collection('blotter');
      const result = await blotterCollection.insertOne(newBlotter);
      res.status(200).send({ success: true, insertedId: result.insertedId });
  } catch (err) {
      console.error('Error adding blotter:', err);
      res.status(500).send({ success: false });
  }
});

// Add a new kasunduan
app.post('/add-kasunduan', async (req, res) => {
  const newKasunduan = req.body;
  
  try {
      const kasunduanCollection = db.collection('blotter-kasunduan');
      const result = await kasunduanCollection.insertOne(newKasunduan);
      res.status(200).send({ success: true, insertedId: result.insertedId });
  } catch (err) {
      console.error('Error adding kasunduan:', err);
      res.status(500).send({ success: false });
  }
});

//edit blotter table
// Update a specific blotter by ID (add this to server.js)
app.put('/update-blotter/:id', async (req, res) => {
  const id = req.params.id;
  const updatedBlotter = {
    date: req.body.date,
    time: req.body.time,
    complainantFirstName: req.body.complainantFirstName,
    complainantMiddleName: req.body.complainantMiddleName,
    complainantLastName: req.body.complainantLastName,
    complaineeFirstName: req.body.complaineeFirstName,
    complaineeMiddleName: req.body.complaineeMiddleName,
    complaineeLastName: req.body.complaineeLastName,
    blotter: req.body.blotter,
    justiceOnDuty: req.body.justiceOnDuty, // This will update the justice on duty
    hearingDate: req.body.hearingDate,
    status: req.body.status,
  };

  try {
    const blotterCollection = db.collection('blotter');
    await blotterCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedBlotter });
    res.status(200).send({ success: true });
  } catch (err) {
    console.error('Error updating blotter:', err);
    res.status(500).send({ success: false });
  }
});


//edit kasunduan
app.put('/update-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  const updatedKasunduan = {
      date: req.body.date,
      time: req.body.time,
      complainantName: req.body.complainantName,
      complaineeName: req.body.complaineeName,
      kasunduan: req.body.kasunduan,
      justiceOnDuty: req.body.justiceOnDuty,
      status: req.body.status,
  };

  try {
      const kasunduanCollection = db.collection('blotter-kasunduan');
      await kasunduanCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedKasunduan });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error updating kasunduan:', err);
      res.status(500).send({ success: false });
  }
});

// delete blotter
app.delete('/delete-blotter/:id', async (req, res) => {
  const blotterId = req.params.id;
  
  try {
    const blotterCollection = db.collection('blotter');
    const result = await blotterCollection.deleteOne({ _id: new ObjectId(blotterId) });
    
    if (result.deletedCount === 1) {
      res.status(200).send({ success: true });
    } else {
      res.status(404).send({ success: false, message: 'Blotter not found' });
    }
  } catch (error) {
    console.error('Error deleting blotter:', error);
    res.status(500).send({ success: false, message: 'Internal Server Error' });
  }
});

// delete kasunduan
app.delete('/delete-kasunduan/:id', async (req, res) => {
  const kasunduanId = req.params.id;
  
  try {
    const kasunduanCollection = db.collection('blotter-kasunduan');
    const result = await kasunduanCollection.deleteOne({ _id: new ObjectId(kasunduanId) });
    
    if (result.deletedCount === 1) {
      res.status(200).send({ success: true });
    } else {
      res.status(404).send({ success: false, message: 'Kasunduan not found' });
    }
  } catch (error) {
    console.error('Error deleting kasunduan:', error);
    res.status(500).send({ success: false, message: 'Internal Server Error' });
  }
});

// transfer blotter
app.put('/transfer-blotter/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const blotterCollection = db.collection('blotter');
      const completeCollection = db.collection('blotter-complete');

      // Find the document to transfer
      const blotter = await blotterCollection.findOne({ _id: new ObjectId(id) });
      if (!blotter) {
          return res.status(404).send('Blotter not found');
      }

      // Insert the document into blotter-complete
      await completeCollection.insertOne(blotter);

      // Delete the document from blotter collection
      await blotterCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error transferring blotter:', err);
      res.status(500).send({ success: false });
  }
});

// transfer kasunduan
app.put('/transfer-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const kasunduanCollection = db.collection('blotter-kasunduan');
      const completeCollection = db.collection('blotter-kasunduan-complete');

      // Find the document to transfer
      const kasunduan = await kasunduanCollection.findOne({ _id: new ObjectId(id) });
      if (!kasunduan) {
          return res.status(404).send('Kasunduan not found');
      }

      // Insert the document into kasunduan-complete
      await completeCollection.insertOne(kasunduan);

      // Delete the document from kasunduan collection
      await kasunduanCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error transferring kasunduan:', err);
      res.status(500).send({ success: false });
  }
});

// display of blotter complete
app.get('/fetch-completed-blotters', async (req, res) => {
  try {
    const completeCollection = db.collection('blotter-complete');
    const blotters = await completeCollection.find().toArray();
    res.json(blotters);
  } catch (err) {
    console.error('Error fetching completed blotters:', err);
    res.status(500).send('Internal Server Error');
  }
});

// display of blotter kasunduan complete
app.get('/fetch-completed-kasunduan', async (req, res) => {
  try {
    const completeKasunduanCollection = db.collection('blotter-kasunduan-complete');
    const kasunduan = await completeKasunduanCollection.find().toArray();
    res.json(kasunduan);
  } catch (err) {
    console.error('Error fetching completed kasunduan:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Blotter (justice on duty dropdown)



// BAGONG LAGAY FOR LUPON.HTML
  // DISPLAY LUPON AND KASUNDUAN TABLE
app.get('/fetch-lupon', async (req, res) => {
  try {
    const luponCollection = db.collection('lupon');
    const luponData = await luponCollection.find().toArray();
    res.json(luponData);
  } catch (err) {
    console.error('Error fetching lupon data:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/fetch-lupon-kasunduan', async (req, res) => {
  try {
    const kasunduanCollection = db.collection('lupon-kasunduan');
    const kasunduanData = await kasunduanCollection.find().toArray();
    res.json(kasunduanData);
  } catch (err) {
    console.error('Error fetching kasunduan data:', err);
    res.status(500).send('Internal Server Error');
  }
});

  // ADDING LUPON AND KASUNDUAN
// POST route to add new Lupon
app.post('/add-lupon', async (req, res) => {
  try {
    const luponCollection = db.collection('lupon');

    // Fetch the last inserted document sorted by 'usapinBlg' in descending order
    const latestEntry = await luponCollection.findOne({}, { sort: { usapinBlg: -1 } });

    let newUsapinBlg = 1; // Default Usapin Blg to 1 if there are no previous entries

    if (latestEntry) {
      newUsapinBlg = parseInt(latestEntry.usapinBlg, 10) + 1; // Increment the last Usapin Blg
    }

    // Create the new Lupon data with the incremented Usapin Blg
    const newLupon = {
      ...req.body,
      usapinBlg: newUsapinBlg.toString(), // Set the new incremented Usapin Blg
    };

    // Insert the new Lupon into the collection
    const result = await luponCollection.insertOne(newLupon);

    // Return success message with inserted document's ID
    res.status(200).send({ success: true, insertedId: result.insertedId });
  } catch (err) {
    console.error('Error adding Lupon:', err);
    res.status(500).send({ success: false, message: 'Error adding Lupon', error: err.message });
  }
});

// GET route to fetch the next Usapin Blg considering both "lupon" and "lupon-complete" collections
app.get('/next-usapin-blg', async (req, res) => {
  try {
    const luponCollection = db.collection('lupon');
    const luponCompleteCollection = db.collection('lupon-complete');

    // Fetch the highest Usapin Blg from both collections
    const [latestLupon, latestLuponComplete] = await Promise.all([
      luponCollection.findOne({}, { sort: { usapinBlg: -1 } }),
      luponCompleteCollection.findOne({}, { sort: { usapinBlg: -1 } })
    ]);

    let nextUsapinBlg = 1; // Default to 1 if no data in either collection

    // Determine the highest Usapin Blg
    if (latestLupon || latestLuponComplete) {
      const highestLuponBlg = latestLupon ? parseInt(latestLupon.usapinBlg, 10) : 0;
      const highestLuponCompleteBlg = latestLuponComplete ? parseInt(latestLuponComplete.usapinBlg, 10) : 0;
      nextUsapinBlg = Math.max(highestLuponBlg, highestLuponCompleteBlg) + 1;
    }

    // Return the next Usapin Blg as JSON
    res.status(200).json({ nextUsapinBlg });
  } catch (err) {
    console.error('Error fetching next Usapin Blg:', err);
    res.status(500).send({ error: 'Failed to get next Usapin Blg.' });
  }
});

app.get('/sorted-usapin-blg', async (req, res) => {
  try {
    const luponCollection = db.collection('lupon');
    const usapinBlgData = await luponCollection.find({}, { projection: { usapinBlg: 1 } }).sort({ usapinBlg: 1 }).toArray();

    res.json(usapinBlgData);
  } catch (err) {
    console.error('Error fetching sorted Usapin Blg:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/add-lupon-kasunduan', async (req, res) => {
  const newKasunduan = req.body;

  try {
      const kasunduanCollection = db.collection('lupon-kasunduan');
      const result = await kasunduanCollection.insertOne(newKasunduan);
      res.status(200).send({ success: true, insertedId: result.insertedId });
  } catch (err) {
      console.error('Error adding Kasunduan:', err);
      res.status(500).send({ success: false });
  }
});

  // EDITING LUPON AND KASUNDUAN
app.put('/update-lupon/:id', async (req, res) => {
  const id = req.params.id;
  const updatedLupon = req.body;

  try {
      const luponCollection = db.collection('lupon');
      await luponCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedLupon });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error updating Lupon:', err);
      res.status(500).send({ success: false });
  }
});

app.put('/update-lupon-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  const updatedKasunduan = req.body;

  try {
      const kasunduanCollection = db.collection('lupon-kasunduan');
      await kasunduanCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedKasunduan });
      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error updating Kasunduan:', err);
      res.status(500).send({ success: false });
  }
});

  // DELETING LUPON AND KASUNDUAN DATA
  app.delete('/delete-lupon/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const luponCollection = db.collection('lupon');
        const result = await luponCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
            res.status(200).send({ success: true });
        } else {
            res.status(404).send({ success: false, message: 'Lupon entry not found' });
        }
    } catch (err) {
        console.error('Error deleting Lupon entry:', err);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
    }
});

app.delete('/delete-lupon-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const kasunduanCollection = db.collection('lupon-kasunduan');
      const result = await kasunduanCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 1) {
          res.status(200).send({ success: true });
      } else {
          res.status(404).send({ success: false, message: 'Kasunduan entry not found' });
      }
  } catch (err) {
      console.error('Error deleting Kasunduan entry:', err);
      res.status(500).send({ success: false, message: 'Internal Server Error' });
  }
});

  // TRANSFER LUPON AND KASUNDUAN
// Transfer Lupon entry from "lupon" collection to "lupon-complete" collection
app.put('/transfer-lupon/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const luponCollection = db.collection('lupon');
      const completeCollection = db.collection('lupon-complete');

      // Find the document to transfer
      const lupon = await luponCollection.findOne({ _id: new ObjectId(id) });
      if (!lupon) {
          return res.status(404).send('Lupon entry not found');
      }

      // Insert the document into the "lupon-complete" collection
      await completeCollection.insertOne(lupon);

      // Delete the document from the original "lupon" collection
      await luponCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).send({ success: true });
  } catch (err) {
      console.error('Error transferring Lupon entry:', err);
      res.status(500).send({ success: false });
  }
});

// Transfer Kasunduan entry from "lupon-kasunduan" collection to "lupon-kasunduan-complete" collection
app.put('/transfer-lupon-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  try {
      const kasunduanCollection = db.collection('lupon-kasunduan');
      const completeKasunduanCollection = db.collection('lupon-kasunduan-complete');

      // Find the document to transfer
      const kasunduan = await kasunduanCollection.findOne({ _id: new ObjectId(id) });
      if (!kasunduan) {
          return res.status(404).json({ success: false, message: 'Kasunduan not found' });
      }

      // Insert the document into the "lupon-kasunduan-complete" collection
      await completeKasunduanCollection.insertOne(kasunduan);

      // Delete the document from the original "lupon-kasunduan" collection
      await kasunduanCollection.deleteOne({ _id: new ObjectId(id) });

      res.status(200).json({ success: true });
  } catch (err) {
      console.error('Error transferring Kasunduan entry:', err);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// BAGONG LAGAY FOR LUPON-COMPLETE.HTML

  // DISPLAY LUPON COMPLETED
app.get('/fetch-completed-lupon', async (req, res) => {
  try {
    const luponCompleteCollection = db.collection('lupon-complete');
    const completedLupon = await luponCompleteCollection.find().toArray();
    res.json(completedLupon); // Return only completed Lupon entries
  } catch (err) {
    console.error('Error fetching completed lupon:', err);
    res.status(500).send('Internal Server Error');
  }
});

// DISPLAY LUPON-KASUNDUAN COMPLETED
app.get('/fetch-completed-lupon-kasunduan', async (req, res) => {
  try {
    const kasunduanCompleteCollection = db.collection('lupon-kasunduan-complete');
    const completedKasunduan = await kasunduanCompleteCollection.find().toArray();
  
    res.json(completedKasunduan); // Return only completed Kasunduan entries
  } catch (err) {
    console.error('Error fetching completed lupon and kasunduan:', err);
    res.status(500).send('Internal Server Error');
  }
});

// BAGONG LAGAY FOR CFA.HTML
  
  // displaying cfa mongo db
  app.get('/fetch-cfa-data', async (req, res) => {
    try {
      const cfaCollection = db.collection('cfa');
      const cfaData = await cfaCollection.find().toArray();
      res.json(cfaData);
    } catch (err) {
      console.error('Error fetching CFA data:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  // adding cfa
  app.post('/add-cfa', async (req, res) => {
    try {
      const cfaCollection = db.collection('cfa');
      const cfaCompleteCollection = db.collection('cfa-complete');
  
      // Fetch the last inserted document from cfa collection
      const latestCfaEntry = await cfaCollection.findOne({}, { sort: { brgyCaseNo: -1 } });
      
      // Fetch the last inserted document from cfa-complete collection
      const latestCfaCompleteEntry = await cfaCompleteCollection.findOne({}, { sort: { brgyCaseNo: -1 } });
  
      // Determine the new Brgy Case No
      let newBrgyCaseNo = 1; // Default to 1 if there are no entries in either collection
  
      if (latestCfaEntry) {
        newBrgyCaseNo = Math.max(newBrgyCaseNo, parseInt(latestCfaEntry.brgyCaseNo, 10) + 1);
      }
  
      if (latestCfaCompleteEntry) {
        newBrgyCaseNo = Math.max(newBrgyCaseNo, parseInt(latestCfaCompleteEntry.brgyCaseNo, 10) + 1);
      }
  
      // Create the new CFA data with the incremented Brgy Case No
      const newCfa = {
        ...req.body,
        brgyCaseNo: newBrgyCaseNo.toString(), // Convert to string for MongoDB
      };
  
      // Insert the new CFA into the collection
      const result = await cfaCollection.insertOne(newCfa);
  
      // Return success message with inserted document's ID
      res.status(200).send({ success: true, brgyCaseNo: newBrgyCaseNo, insertedId: result.insertedId });
    } catch (err) {
      console.error('Error adding CFA:', err);
      res.status(500).send({ success: false, message: 'Error adding CFA', error: err.message });
    }
  });
  

// GET route to fetch the next Brgy Case No
app.get('/next-brgy-case-no-cfa', async (req, res) => {
  try {
      const cfaCollection = db.collection('cfa');
      const cfaCompleteCollection = db.collection('cfa-complete');
      
      // Find the highest brgyCaseNo in both collections
      const highestCfaCase = await cfaCollection.find().sort({ brgyCaseNo: -1 }).limit(1).toArray();
      const highestCfaCompleteCase = await cfaCompleteCollection.find().sort({ brgyCaseNo: -1 }).limit(1).toArray();
      
      // Extract the highest number
      const highestCaseNoCfa = highestCfaCase[0]?.brgyCaseNo || 0;
      const highestCaseNoComplete = highestCfaCompleteCase[0]?.brgyCaseNo || 0;
      
      // Get the maximum of both
      const nextBrgyCaseNo = Math.max(highestCaseNoCfa, highestCaseNoComplete) + 1;
      
      res.json({ nextBrgyCaseNo });
  } catch (err) {
      console.error("Error fetching next brgyCaseNo:", err);
      res.status(500).json({ error: "Internal Server Error" });
  }
});

  // editing cfa
  app.put('/update-cfa/:id', async (req, res) => {
    const id = req.params.id;
    const updatedCFA = req.body;
  
    try {
      const cfaCollection = db.collection('cfa');
      await cfaCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedCFA });
      res.status(200).send({ success: true });
    } catch (err) {
      console.error('Error updating CFA:', err);
      res.status(500).send({ success: false });
    }
  });
  
  // deleting cfa
  app.delete('/delete-cfa/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const cfaCollection = db.collection('cfa');
      const result = await cfaCollection.deleteOne({ _id: new ObjectId(id) });
      
      if (result.deletedCount === 1) {
        res.status(200).send({ success: true });
      } else {
        res.status(404).send({ success: false, message: 'CFA entry not found' });
      }
    } catch (err) {
      console.error('Error deleting CFA:', err);
      res.status(500).send({ success: false });
    }
  });

  // transfer cfa to complete
  app.put('/transfer-cfa/:id', async (req, res) => {
    const id = req.params.id;
    try {
      const cfaCollection = db.collection('cfa');
      const completeCollection = db.collection('cfa-complete');
  
      // Find the document to transfer
      const cfa = await cfaCollection.findOne({ _id: new ObjectId(id) });
      if (!cfa) {
        return res.status(404).json({ success: false, message: 'CFA not found' }); // Proper JSON format
      }
  
      // Insert the document into "cfa-complete"
      await completeCollection.insertOne(cfa);
  
      // Delete the document from "cfa" collection
      await cfaCollection.deleteOne({ _id: new ObjectId(id) });
  
      res.status(200).json({ success: true }); // Respond with JSON
    } catch (err) {
      console.error('Error transferring CFA:', err);
      res.status(500).json({ success: false, message: 'Internal Server Error' }); // Error response in JSON
    }
  });
  

// BAGONG LAGAY FOR CFA-COMPLETE.HTML

  // display cfa-complete mongodb
app.get('/fetch-cfa-complete-data', async (req, res) => {
  try {
    const cfaCompleteCollection = db.collection('cfa-complete');
    const cfaCompleteData = await cfaCompleteCollection.find().toArray();
    res.json(cfaCompleteData);
  } catch (err) {
    console.error('Error fetching completed CFA data:', err);
    res.status(500).send('Internal Server Error');
  }
});


  
/************************ ADMIN SIDE END ************************/ 







/************************ GENERATE START ************************/

// Fetch a specific blotter by ID
app.get('/fetch-blotter/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const blotterCollection = db.collection('blotter');
    const blotter = await blotterCollection.findOne({ _id: new ObjectId(id) });
    res.json(blotter);
  } catch (err) {
    console.error('Error fetching blotter by ID:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Fetch a specific kasunduan by ID from the 'blotter-kasunduan' collection
app.get('/fetch-blotter-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const kasunduanCollection = db.collection('blotter-kasunduan');
    const kasunduan = await kasunduanCollection.findOne({ _id: new ObjectId(id) });
    res.json(kasunduan);
  } catch (err) {
    console.error('Error fetching kasunduan by ID:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/fetch-lupon/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const luponCollection = db.collection('lupon');
    const lupon = await luponCollection.findOne({ _id: new ObjectId(id) });
    res.json(lupon);
  } catch (err) {
    console.error('Error fetching Lupon:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/fetch-lupon-kasunduan/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const kasunduanCollection = db.collection('lupon-kasunduan');
    const kasunduan = await kasunduanCollection.findOne({ _id: new ObjectId(id) });
    res.json(kasunduan);
  } catch (err) {
    console.error('Error fetching Kasunduan:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/fetch-cfa-data/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const cfaCollection = db.collection('cfa');
    const cfaData = await cfaCollection.findOne({ _id: new ObjectId(id) });
    res.json(cfaData);
  } catch (err) {
    console.error('Error fetching CFA data:', err);
    res.status(500).send('Internal Server Error');
  }
});

/************************ GENERATE END ************************/

/************************ MODULE START ************************/

// Fetch all modules from the "module" collection
app.get('/modules', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    const modules = await moduleCollection.find().toArray();
    res.json(modules); // Send the modules data as JSON to the frontend
  } catch (err) {
    console.error('Error fetching modules:', err);
    res.status(500).send('Internal Server Error');
  }
});

// POST route to add a new elected official (without photo for now)
app.post('/modules', async (req, res) => {
  try {
    const { firstName, middleName, lastName, position } = req.body;
    
    const moduleCollection = db.collection('module');

    // Check if this person is already assigned to any position
    const existingOfficial = await moduleCollection.findOne({
      firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
      middleName: { $regex: new RegExp(`^${middleName}$`, 'i') },
      lastName: { $regex: new RegExp(`^${lastName}$`, 'i') }
    });

    if (existingOfficial) {
      return res.status(400).json({ success: false, message: 'This person is already assigned to a position.' });
    }

    // Check if the position is a key position and already exists
    const keyPositions = ['Punong Barangay', 'Secretary', 'Treasurer', 'SK Chairperson', 'Lupon Chairperson'];
    if (keyPositions.includes(position)) {
      const positionExists = await moduleCollection.findOne({ position });
      if (positionExists) {
        return res.status(400).json({ success: false, message: `Position ${position} is already filled. Only one person can hold this position.` });
      }
    }

    // Create new official
    const newOfficial = { firstName, middleName, lastName, position, Profilepic: '' };
    await moduleCollection.insertOne(newOfficial);

    res.status(201).json({ success: true, message: 'Official added successfully' });
  } catch (err) {
    console.error('Error adding official:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

//for edit
app.get('/modules/:id', async (req, res) => {
  const id = req.params.id;

  try {
      const moduleCollection = db.collection('module');
      const official = await moduleCollection.findOne({ _id: new ObjectId(id) });

      if (!official) {
          return res.status(404).send('Official not found');
      }

      res.json(official);
  } catch (err) {
      console.error('Error fetching official:', err);
      res.status(500).send('Internal Server Error');
  }
});

app.put('/modules/:id', async (req, res) => {
  const id = req.params.id;
  const { firstName, middleName, lastName, position } = req.body;

  try {
    const moduleCollection = db.collection('module');

    // Check if this person is already assigned to another position
    const existingOfficial = await moduleCollection.findOne({
      firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
      middleName: { $regex: new RegExp(`^${middleName}$`, 'i') },
      lastName: { $regex: new RegExp(`^${lastName}$`, 'i') },
      _id: { $ne: new ObjectId(id) } // Exclude the current official being updated
    });

    if (existingOfficial) {
      return res.status(400).json({ success: false, message: 'This person is already assigned to a position.' });
    }

    // Check if the position is a key position and already exists for another official
    const keyPositions = ['Punong Barangay', 'Secretary', 'Treasurer', 'SK Chairperson', 'Lupon Chairperson'];
    if (keyPositions.includes(position)) {
      const positionExists = await moduleCollection.findOne({ position, _id: { $ne: new ObjectId(id) } });
      if (positionExists) {
        return res.status(400).json({ success: false, message: `Position ${position} is already filled. Only one person can hold this position.` });
      }
    }

    // Proceed with the update
    const updatedOfficial = { firstName, middleName, lastName, position, Profilepic: req.body.Profilepic || "" };
    const result = await moduleCollection.updateOne({ _id: new ObjectId(id) }, { $set: updatedOfficial });

    if (result.modifiedCount === 0) {
      return res.status(404).send('Official not found');
    } else {
      res.status(200).json({ success: true, message: 'Official updated successfully' });
    }
  } catch (err) {
    console.error('Error updating official:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

app.delete('/modules/:id', async (req, res) => {
  const id = req.params.id;

  try {
      const moduleCollection = db.collection('module');
      const result = await moduleCollection.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: 'Official deleted successfully' });
      } else {
          res.status(404).json({ success: false, message: 'Official not found' });
      }
  } catch (err) {
      console.error('Error deleting official:', err);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

/************************ MODULE END ************************/


/************** WELCOME AND HOME PAGE START *****************/

// BAGONG LAGAY FOR WELCOME AND HOME PAGE (MAINTENANCE)

// Endpoint to fetch officials
app.get('/get-officials', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    // Fetch officials data
    const officials = await moduleCollection.find().toArray();
    res.json(officials); // Send officials data as JSON
  } catch (err) {
    console.error('Error fetching officials:', err);
    res.status(500).send('Internal Server Error');
  }
});


/************** WELCOME AND HOME PAGE START *****************/

/**************  CONNECT MODULE IN DROPDOWNS *****************/
// Blotter Justice On Duty
app.get('/fetch-justice-on-duty', async (req, res) => {
  try {
    const moduleCollection = db.collection('module'); // Use the correct collection name
    const justiceList = await moduleCollection.find({ position: 'Imbestigador' }).toArray(); // Fetch only those with 'Imbestigador' position
    res.json(justiceList); // Send the filtered list back to the client
  } catch (err) {
    console.error('Error fetching justice on duty:', err);
    res.status(500).send('Internal Server Error');
  }
});

// CFA Pangkat Chairperson and Pangkat Members
// Fetch Pangkat Chairperson
app.get('/fetch-pangkat-chairperson', async (req, res) => {
  try {
      const moduleCollection = db.collection('module');
      const chairpersons = await moduleCollection.find({ position: 'Lupon Chairperson' }).toArray();
      res.json(chairpersons);
  } catch (err) {
      console.error('Error fetching Pangkat Chairperson:', err);
      res.status(500).send('Internal Server Error');
  }
});

// Fetch Pangkat Members (Tagapamayapa)
app.get('/fetch-pangkat-members', async (req, res) => {
  try {
      const moduleCollection = db.collection('module');
      const pangkatMembers = await moduleCollection.find({ position: 'Lupon Tagapamayapa' }).toArray();
      res.json(pangkatMembers);
  } catch (err) {
      console.error('Error fetching Pangkat Members:', err);
      res.status(500).send('Internal Server Error');
  }
});

/************** CONNECT MODULE IN DROPDOWNS END*****************/

/************** CONNECT MODULE IN CERTIFICATES START*****************/

// for punong barangay

app.get('/fetch-punong-barangay', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    const punongBarangay = await moduleCollection.findOne({ position: 'Punong Barangay' });
    if (punongBarangay) {
      res.json({ name: `${punongBarangay.firstName} ${punongBarangay.middleName} ${punongBarangay.lastName}` });
    } else {
      res.status(404).json({ message: 'Punong Barangay not found' });
    }
  } catch (err) {
    console.error('Error fetching Punong Barangay:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Fetch Barangay Secretary
app.get('/fetch-secretary', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    const secretary = await moduleCollection.findOne({ position: 'Secretary' });
    if (secretary) {
      res.json({ name: `${secretary.firstName} ${secretary.middleName} ${secretary.lastName}` });
    } else {
      res.status(404).json({ message: 'Secretary not found' });
    }
  } catch (err) {
    console.error('Error fetching Secretary:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Fetch Barangay Treasurer
app.get('/fetch-treasurer', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    const treasurer = await moduleCollection.findOne({ position: 'Treasurer' });
    if (treasurer) {
      res.json({ name: `${treasurer.firstName} ${treasurer.middleName} ${treasurer.lastName}` });
    } else {
      res.status(404).json({ message: 'Treasurer not found' });
    }
  } catch (err) {
    console.error('Error fetching Treasurer:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Fetch Barangay Kagawads
// Fetch only the first 7 Barangay Kagawads
app.get('/fetch-kagawads', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    // Fetch only the first 7 Kagawads
    const kagawads = await moduleCollection.find({ position: 'Kagawad' }).limit(7).toArray();
    if (kagawads.length > 0) {
      const kagawadNames = kagawads.map(kagawad => `${kagawad.firstName} ${kagawad.middleName} ${kagawad.lastName}`);
      res.json(kagawadNames);
    } else {
      res.status(404).json({ message: 'No Kagawads found' });
    }
  } catch (err) {
    console.error('Error fetching Kagawads:', err);
    res.status(500).send('Internal Server Error');
  }
});


// Fetch SK Chairperson
app.get('/fetch-sk-chairperson', async (req, res) => {
  try {
    const moduleCollection = db.collection('module');
    const skChairperson = await moduleCollection.findOne({ position: 'SK Chairperson' });
    if (skChairperson) {
      res.json({ name: `${skChairperson.firstName} ${skChairperson.middleName} ${skChairperson.lastName}` });
    } else {
      res.status(404).json({ message: 'SK Chairperson not found' });
    }
  } catch (err) {
    console.error('Error fetching SK Chairperson:', err);
    res.status(500).send('Internal Server Error');
  }
});


/************** CONNECT MODULE IN CERTIFICATES END*****************/


/************** PAYMONGO START *****************/
app.post('/request-cert-payment', async (req, res) => {
  const { firstName, middleName, lastName } = req.body;

  try {
     // Query the resident collection for the user's email
     const resident = await db.collection('resident').findOne({
        Firstname: { $regex: new RegExp(`^${firstName}$`, 'i') },
        Middlename: { $regex: new RegExp(`^${middleName}$`, 'i') },
        Lastname: { $regex: new RegExp(`^${lastName}$`, 'i') }
     });

     if (!resident) {
        return res.status(404).json({ success: false, message: 'Resident not found' });
     }

     const userEmail = resident['e-mail']; // Assuming email is stored in 'e-mail'

     // Define the apiKey from environment variable
     const apiKey = process.env.PAYMONGO_SECRET_KEY;
     const encodedKey = Buffer.from(apiKey).toString('base64');

     // Generate PayMongo Payment Link
     const paymentResponse = await axios.post('https://api.paymongo.com/v1/links', {
        data: {
           attributes: {
              amount: 10000,  // Replace with actual amount in centavos
              description: "Certificate Request",
              remarks: `${firstName} ${middleName} ${lastName}'s Document Request`
           }
        }
     }, {
        headers: {
           'Authorization': `Basic ${encodedKey}`, // Pass the encoded key here
           'Content-Type': 'application/json'
        }
     });

     const paymentLink = paymentResponse.data.data.attributes.checkout_url;

     // Send Payment Link via Email using Nodemailer
     let transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
           user: process.env.EMAIL_USER, // Use the email from .env
           pass: process.env.EMAIL_PASSWORD // Use the password from .env
        }
     });

     let mailOptions = {
        from: process.env.EMAIL_USER,  // Use the sender's email from .env
        to: userEmail,  // Send to the user's email fetched from the resident collection
        subject: 'Payment Link for Your Document Request - Certification',
        text: `Hello ${firstName},\n\nPlease complete your payment by clicking on the link below:\n\n${paymentLink}\n\nThank you!`,
        cc: 'brgysantafe@dasmarinas', // CC to another email address if necessary
        replyTo: 'brgysantafe@dasmarinas' // Reply-to email
     };

     // Send the email
     transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
           console.log('Error sending email:', error);
           return res.status(500).json({ success: false, message: 'Error sending email' });
        } else {
           console.log('Email sent: ' + info.response);
           // Send the email address along with the payment link
           return res.status(200).json({ success: true, paymentLink, email: userEmail });
        }
     });

  } catch (error) {
     console.error('Error:', error.response ? error.response.data : error.message);
     res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

app.post('/request-clear-payment', async (req, res) => {
  const { firstName, middleName, lastName } = req.body;

  try {
      // Query the resident collection for the user's email
      const resident = await db.collection('resident').findOne({
          Firstname: { $regex: new RegExp(`^${firstName}$`, 'i') },
          Middlename: { $regex: new RegExp(`^${middleName}$`, 'i') },
          Lastname: { $regex: new RegExp(`^${lastName}$`, 'i') }
      });

      if (!resident) {
          return res.status(404).json({ success: false, message: 'Resident not found' });
      }

      const userEmail = resident['e-mail']; // Assuming email is stored in 'e-mail'

      // Define the apiKey from environment variable
      const apiKey = process.env.PAYMONGO_SECRET_KEY;
      const encodedKey = Buffer.from(apiKey).toString('base64');

      // Generate PayMongo Payment Link for clearance
      const paymentResponse = await axios.post('https://api.paymongo.com/v1/links', {
          data: {
              attributes: {
                  amount: 10000,  // Replace with actual amount in centavos for clearance (e.g., 150.00 PHP = 15000 centavos)
                  description: "Clearance Request",
                  remarks: `${firstName} ${middleName} ${lastName}'s Clearance Request`
              }
          }
      }, {
          headers: {
              'Authorization': `Basic ${encodedKey}`, // Pass the encoded key here
              'Content-Type': 'application/json'
          }
      });

      const paymentLink = paymentResponse.data.data.attributes.checkout_url;

      // Send Payment Link via Email using Nodemailer
      let transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
              user: process.env.EMAIL_USER, // Use the email from .env
              pass: process.env.EMAIL_PASSWORD // Use the password from .env
          }
      });

      let mailOptions = {
          from: process.env.EMAIL_USER,  // Use the sender's email from .env
          to: userEmail,  // Send to the user's email fetched from the resident collection
          subject: 'Payment Link for Your Document Request - Clearance',
          text: `Hello ${firstName},\n\nPlease complete your payment by clicking on the link below:\n\n${paymentLink}\n\nThank you!`,
          cc: 'brgysantafe@dasmarinas', // CC to another email address if necessary
          replyTo: 'brgysantafe@dasmarinas' // Reply-to email
      };

      // Send the email
      transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
              console.log('Error sending email:', error);
              return res.status(500).json({ success: false, message: 'Error sending email' });
          } else {
              console.log('Email sent: ' + info.response);
              return res.status(200).json({ success: true, paymentLink, email: userEmail });
          }
      });

  } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

app.post('/request-indi-payment', async (req, res) => {
  const { firstName, middleName, lastName } = req.body;

  try {
      // Query the resident collection for the user's email
      const resident = await db.collection('resident').findOne({
          Firstname: { $regex: new RegExp(`^${firstName}$`, 'i') },
          Middlename: { $regex: new RegExp(`^${middleName}$`, 'i') },
          Lastname: { $regex: new RegExp(`^${lastName}$`, 'i') }
      });

      if (!resident) {
          return res.status(404).json({ success: false, message: 'Resident not found' });
      }

      const userEmail = resident['e-mail']; // Assuming email is stored in 'e-mail'

      // Define the apiKey from environment variable
      const apiKey = process.env.PAYMONGO_SECRET_KEY;
      const encodedKey = Buffer.from(apiKey).toString('base64');

      // Generate PayMongo Payment Link for indigency
      const paymentResponse = await axios.post('https://api.paymongo.com/v1/links', {
          data: {
              attributes: {
                  amount: 10000,  // Replace with actual amount in centavos for indigency (e.g., 100.00 PHP = 10000 centavos)
                  description: "Indigency Request",
                  remarks: `${firstName} ${middleName} ${lastName}'s Indigency Request`
              }
          }
      }, {
          headers: {
              'Authorization': `Basic ${encodedKey}`, // Pass the encoded key here
              'Content-Type': 'application/json'
          }
      });

      const paymentLink = paymentResponse.data.data.attributes.checkout_url;

      // Send Payment Link via Email using Nodemailer
      let transporter = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
              user: process.env.EMAIL_USER, // Use the email from .env
              pass: process.env.EMAIL_PASSWORD // Use the password from .env
          }
      });

      let mailOptions = {
          from: process.env.EMAIL_USER,  // Use the sender's email from .env
          to: userEmail,  // Send to the user's email fetched from the resident collection
          subject: 'Payment Link for Your Document Request - Indigency',
          text: `Hello ${firstName},\n\nPlease complete your payment by clicking on the link below:\n\n${paymentLink}\n\nThank you!`,
          cc: 'brgysantafe@dasmarinas', // CC to another email address if necessary
          replyTo: 'brgysantafe@dasmarinas' // Reply-to email
      };

      // Send the email
      transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
              console.log('Error sending email:', error);
              return res.status(500).json({ success: false, message: 'Error sending email' });
          } else {
              console.log('Email sent: ' + info.response);
              return res.status(200).json({ success: true, paymentLink, email: userEmail });
          }
      });

  } catch (error) {
      console.error('Error:', error.response ? error.response.data : error.message);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

/************** PAYMONGO END *****************/

/************** NOTIFICATION VIA EMAIL START *****************/
app.get('/api/residents/search', async (req, res) => {
  const { query } = req.query;
  const regex = new RegExp(query, 'i'); // Case-insensitive search
  const residents = await db.collection('resident').find({
    $or: [
      { Firstname: regex },
      { Middlename: regex },
      { Lastname: regex }
    ]
  }).project({ Firstname: 1, Middlename: 1, Lastname: 1, 'e-mail': 1 }).toArray();
  res.json(residents);
});

// Assuming you have an established MongoDB client connection
app.post('/api/notification/send-email', upload.single('attachment'), async (req, res) => {
  console.log("Received email send request");
  
  let { to, subject, message } = req.body;
  const attachment = req.file;
  let recipients = [];

  if (req.body.sendToAll === 'true') {
      console.log("Fetching all resident emails...");
      try {
        const residentsCollection = db.collection("resident");
        const allResidents = await residentsCollection.find({}, { projection: { 'e-mail': 1 } }).toArray();
        recipients = allResidents.map(resident => resident['e-mail']);
        console.log("Fetched resident emails:", recipients);
      } catch (error) {
          console.error("Error fetching resident emails:", error);
          return res.status(500).json({ success: false, message: 'Error fetching resident emails' });
      }
  } else {
      // Split multiple emails separated by commas
      recipients = to.split(',').map(email => email.trim());
      console.log("Directly specified recipients:", recipients);
  }

  let attachments = [];
  if (attachment) {
      const filePath = path.join(__dirname, attachment.path);
      attachments.push({
          filename: attachment.originalname,
          path: filePath,
          contentType: attachment.mimetype,
      });
      console.log("Attachment added:", attachment.originalname);
  }

  const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipients,
      subject,
      text: message,
      attachments,
  };

  console.log("Attempting to send email...");

  // Respond immediately to prevent pending request
  res.status(200).json({ success: true, message: 'Email is being sent' });

  transporter.sendMail(mailOptions, function (error, info) {
      if (attachment) {
          const filePath = path.join(__dirname, attachment.path);
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) console.error("Error cleaning up file:", unlinkErr);
            else console.log("Attachment file deleted after sending.");
          });
      }

      if (error) {
          console.error("Error sending email:", error);
      } else {
          console.log('Email sent successfully:', info.response);
      }
  });
});


/************** NOTIFICATION VIA EMAIL END *****************/