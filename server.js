
const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas } = require('canvas');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');

require('dotenv').config(); 
const accessToken = process.env.EMOJI_API_KEY;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const { initializeDB } = require('./populatedb.js');
const { showDatabaseContents } = require('./showdb.js');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'PETs';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)


// Configure passport
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`,
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope:['profile']
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// GETs ---------------------------------------------------------------------------
app.get('/', async (req, res) => {
    const posts = await getPosts();
    const user = await getCurrentUser(req) || {};
    res.render('home', { user, posts });
});

app.get('/auth/google', passport.authenticate('google'));

// Handle Google callback
app.get('/auth/google/callback', 
    passport.authenticate('google', {failureRedirect: '/'}),
    async (req, res) => {
        const googleId = req.user.id;
        const hashedGoogleId = crypto.hash('SHA-256', googleId.toString());
        req.session.hashedGoogleId = hashedGoogleId;

        try {
            let localUser = await findUserByHashedGoogleid(hashedGoogleId);
            if (localUser) {
                req.session.userId = localUser.id;
                req.session.loggedIn = true;
                res.redirect('/');
            } else {
                res.redirect('/registerUsername');
            }
        }
        catch(err) {
            console.error("Error finding user:", err);
            res.redirect('error');
        }
    }
);

app.get('/registerUsername', (req, res) => {
    res.render('registerUsername');
});

app.get('/loginregister', (req, res) => {
    res.render('loginRegister');
});

app.get('/profile', isAuthenticated, (req, res) => {
    // TODO: Render profile page
    if (req.session.userId)
        renderProfile(req, res);
});

app.get('/avatar/:username', (req, res) => {
    // TODO: Serve the avatar image for the user
    handleAvatar(req, res);
});

app.get('/emojis', async (req, res) => {
    // TODO: fetch emoji stuff
    try {
        const response = await fetch(`https://emoji-api.com/emojis?access_key=${accessToken}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching emojis:', error);
        res.status(500).send('Error fetching emojis');
    }
});

app.get('/sort/like', async (req, res) => {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const posts = await db.all('SELECT * FROM posts ORDER BY likes DESC');
        res.render('partials/postList', { posts, layout: false });
    } catch (err) {
        console.error('Error sorting post likes:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        await db.close();
    }
});

app.get('/sort/like/:type', async (req, res) => {
    const petType = req.params.type;

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const posts = await db.all('SELECT * FROM posts WHERE pet = ? ORDER BY likes DESC', [petType.slice(1)]);
        res.render('partials/postList', { posts, layout: false });
    } catch (err) {
        console.error('Error sorting post likes with pet:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        await db.close();
    }
});

app.get('/sort/recent/:type', async (req, res) => {
    const petType = req.params.type;

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const posts = await db.all('SELECT * FROM posts WHERE pet = ? ORDER BY timestamp DESC', [petType.slice(1)]);
        res.render('partials/postList', { posts, layout: false });
    } catch (err) {
        console.error('Error sorting post recent with pet:', err);
        res.status(500).send('Internal Server Error');
    } finally {
        await db.close();
    }
});

app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

// Error route: render error page
app.get('/error', (req, res) => {
    res.render('error');
});

app.get('/logout', (req, res) => {
    // TODO: Logout the user
    if (req.session.userId)
        logoutUser(req, res);
});

app.get('/changeUsername', (req, res) => {
    if (req.session.loggedIn) {
        res.render('changeUsername');
    }
});

// POSTs -------------------------------------------------------------------------
app.post('/registerUsername', (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);
});

app.post('/loginRegister', (req, res) => {
    res.redirect('/auth/google');
});

// Additional routes that you must implement
app.post('/posts', async (req, res) => {
    // TODO: Add a new post and redirect to home
    if (req.session.userId){
        const user = await getCurrentUser(req);
        await addPost(req.body.title, req.body.pets, req.body.content, user.username);
        res.redirect('/');
    }
});

app.post('/like/:id', (req, res) => {
    // TODO: Update post likes
    if (req.session.userId)
        updatePostLikes(req, res);
});

app.post('/delete/:id', isAuthenticated, (req, res) => {
    // TODO: Delete a post if the current user is the owner
    if (req.session.userId) {
        deletePost(req, res);
    }
});

app.post('/changeUsername', (req, res) => {
    if (req.session.loggedIn){
        changeUsername(req, res);
    }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const dbFileName = './database.db';

// Ensure the database is initialized before starting the server.
initializeDB().then(() => {
    console.log('Database initialized. Server starting...');
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to initialize the database:', err);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

function getTimeStamp() {
    let tempDate = new Date();
    let day = tempDate.getDate();
    let month = tempDate.getMonth() + 1;
    let year = tempDate.getFullYear();
    let hours = tempDate.getHours();
    let minutes = tempDate.getMinutes();
    if (day < 10)
        day = '0' + day;
    if (month < 10)
        month = '0' + month;
    if (hours < 10) 
        hours = '0' + hours;
    if (minutes < 10)
        minutes = '0' + minutes;
    let timeSt = year + "-" + month + "-"  + day + " " + hours + ":" + minutes;
    return timeSt;
}

// Function to find a user by username
async function findUserByUsername(username) {
    // TODO: Return user object if found, otherwise return undefined
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        if (user == null)
            return undefined;

        return user;
        
    } catch (err) {
        console.error('Error finding user by username:', err);
    } finally {
        await db.close();
    }
}

// Function to find a user by user ID
async function findUserById(userId) {
    // TODO: Return user object if found, otherwise return undefined
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (user == null)
            return undefined;

        return user;
        
    } catch (err) {
        console.error('Error finding user by id:', err);
    } finally {
        await db.close();
    }
}

async function findUserByHashedGoogleid(hashedGoogleId) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [hashedGoogleId]);
        if (user == null)
            return undefined;

        return user;
        
    } catch (err) {
        console.error('Error finding user by hashedGoogleId:', err);
    } finally {
        await db.close();
    }
}

// Function to get the current user from session
async function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    return await findUserById(req.session.userId);
}

// Function to add a new user
async function addUser(req) {
    // TODO: Create a new user object and add to users array
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        let usrTime = getTimeStamp();
        
        await db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
            [req.body.username, req.session.hashedGoogleId, undefined, usrTime]
        );
        
    } catch (err) {
        console.error('Error adding user:', err);
    } finally {
        await db.close();
    }
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
async function registerUser(req, res) {
    const user = await findUserByUsername(req.body.username);
    if (user) {
        // res.redirect('/register?error=Username+already+exists');
        res.render('registerUsername', {regError: 'username already exists'});
    } else {
        await addUser(req);
        await loginUser(req, res);
    }
}

// Function to login a user
async function loginUser(req, res) {
    const user = await findUserByUsername(req.body.username);
    if (user) {
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    } else {
        res.redirect('/login?error=Invalid+username');
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            res.redirect('/error');
        } else {
            res.redirect('/googleLogout');
        }
    });
}

// Function to render the profile page
async function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
    let curr = await getCurrentUser(req);
    let psts = await getPosts();
    let user = {username: curr.username, memberSince: curr.memberSince, posts: []};
    for (let i = 0; i < psts.length; i++) {
        if (psts[i].username == curr.username) {
            user.posts.push(psts[i]);
        }
    }
    let postNeoType = 'Post';
    res.render('profile', {user, postNeoType});
}

async function findPostById(idVal) {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [idVal]);
        if (post == null)
            return undefined;

        return post;
        
    } catch (err) {
        console.error('Error finding user by id:', err);
    } finally {
        await db.close();
    }
}

// Function to get all posts, sorted by latest first
async function getPosts() {

    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        const posts = await db.all('SELECT * FROM posts ORDER BY timestamp DESC');
        if (posts == null)
            return undefined;

        return posts;
    } catch (err) {
        console.error('Error updating post likes:', err);
    } finally {
        await db.close();
    }
}

// Function to add a new post
async function addPost(title, pet, content, user) {
    // TODO: Create a new post object and add to posts array
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    try {
        let usrTime = getTimeStamp();
        await db.run(
            'INSERT INTO posts (title, content, pet, username, timestamp, likes) VALUES (?, ?, ?, ?, ?, ?)',
            [title, content, pet, user, usrTime, 0]
        );
        
    } catch (err) {
        console.error('Error adding post:', err);
    } finally {
        await db.close();
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
    let likedPost = await findPostById(req.body.postId);

    if (likedPost) {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        try {
            await db.run('UPDATE posts SET likes = ? WHERE id = ?', [likedPost.likes + 1, req.body.postId]);

            res.status(200);
            res.send({value: likedPost.likes + 1});
        } catch (err) {
            console.error('Error updating post likes:', err);
        } finally {
            await db.close();
        }
    }
}

async function deletePost(req, res) {
    let currUsr = getCurrentUser(req);
    let dltPost = findPostById(req.body.postId);

    if (currUsr.username == dltPost.username) {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

        try {
            await db.run('DELETE FROM posts WHERE id = ?', [req.body.postId]);
            res.status(200);
            res.send({ success: true });
            
        } catch (err) {
            console.error('Error adding user:', err);
        } finally {
            await db.close();
        }
    } else {
        res.status(401);
    }
}

// Function to handle avatar generation and serving
async function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
    const { username } = req.params;
    const user = await findUserByUsername(username);

    if (user) {
        const letter = username.charAt(0).toUpperCase();
        const avatar = generateAvatar(letter);

        res.set('Content-Type', 'image/png');
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        
        try {
            await db.run('UPDATE users SET avatar_url = ? WHERE username = ?', [`/avatar/${user.username}`, user.username]);
            res.status(200);
            res.send(avatar);
            
        } catch (err) {
            console.error('Error handling avatar:', err);
        } finally {
            await db.close();
        }
    } else
        res.status(404).send('User not found');
}

// Function to generate an image avatar
function generateAvatar(letter, width = 80, height = 80) {
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const colors = ['#ffc0b3', '#b3ffc0', '#b3ccff', '#ffb3f2', '#c0b3ff'];
    const color = colors[letter.charCodeAt(0) % colors.length];

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);

    ctx.font = 'bold 50px Quicksand';
    ctx.fillStyle = '#393E41';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, width / 2, height / 2);

    return canvas.toBuffer('image/png');
}

async function changeUsername(req, res) {
    const newName = await findUserByUsername(req.body.username);
    
    if (newName) {
        res.render('changeUsername', {regError: 'username already exists'});
    } else {
        const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });
        try {
            const curr = await(getCurrentUser(req));
            await db.run('UPDATE posts SET username = ? WHERE username = ?', [req.body.username, curr.username]);
            await db.run('UPDATE users SET username = ?, avatar_url = ? WHERE id = ?', [req.body.username, `/avatar/${req.body.username}`, curr.id]);
            res.status(200);
            res.render('changeUsername', {resSucc: "Successfully changed username"});
            
        } catch (err) {
            console.error('Error changing username:', err);
        } finally {
            await db.close();
        }
    }
}