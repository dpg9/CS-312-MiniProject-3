// index.js
import pg from "pg";
import express from "express";
import bodyParser from "body-parser";
import session from "express-session";

// Create a new client instance
const client = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "BlogDB",
  password: "onelove44",
  port: 5432,
});

const app = express();

// Create a session to track users
app.use(
  session({
    secret: "secretkey",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }, // Use true in production with HTTPS
  })
);

//Middleware to parse requests
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static("public"));

// Set EJS as the view engine
app.set("view engine", "ejs");
app.set("views", "./views");

// Connect to the database
client.connect();

// Serve signup page
app.get("/signup", (req, res) => {
  res.render("signup");
});

// Handle signup submission
app.post("/signup", (req, res) => {
  const { name, user_id, password } = req.body;

  // Check if the user_id already exists
  client.query(
    "SELECT * FROM users WHERE name = $1",
    [user_id],
    (err, result) => {
      if (result.rows.length > 0) {
        // If user exists, send an error message
        res.send("User ID is already taken. Please choose a different one.");
      } else {
        // Insert the new user into the users table
        client.query(
          "INSERT INTO users (name, password) VALUES ($1, $2)",
          [name, password],
          (err) => {
            if (err) {
              console.error(err);
              res.send("Error during signup.");
            } else {
              // Redirect to the signin page after successful signup
              res.redirect("/signin");
            }
          }
        );
      }
    }
  );
});

// Serve signin page
app.get("/signin", (req, res) => {
  res.render("signin");
});

// Handle signin submission
app.post("/signin", (req, res) => {
  const { user_id, password } = req.body;

  // Check if the user_id and password match a user
  client.query(
    "SELECT * FROM users WHERE name = $1 AND password = $2",
    [user_id, password],
    (err, result) => {
      if (err || result.rows.length === 0) {
        res.send("Incorrect user ID or password.");
      } else {
        // Store user ID and username in session after successful sign-in
        req.session.user_id = result.rows[0].user_id;
        req.session.username = result.rows[0].name;

        // Redirect to the blog feed if sign-in is successful
        res.redirect("/blogs");
      }
    }
  );
});

// Serve the create post page
app.get("/create-post", (req, res) => {
  res.render("createPost"); // Render the createPost.ejs form
});

// Handle new post creation
app.post("/create-post", (req, res) => {
  const { title, body } = req.body;
  const creator_user_id = req.session.user_id; // Get the current user's ID from the session
  const creator_name = req.session.username; // Get the current user's name from the session

  if (!creator_user_id) {
    res.redirect("/signin"); // Redirect to sign-in page if not logged in
    return;
  }

  // Insert the new blog post into the database with the correct user's name and ID
  client.query(
    "INSERT INTO blogs (creator_name, creator_user_id, title, body) VALUES ($1, $2, $3, $4)",
    [creator_name, creator_user_id, title, body],
    (err) => {
      if (err) {
        console.error(err);
        res.send("Error creating blog post.");
      } else {
        res.redirect("/blogs"); // Redirect to the blog feed after successful post creation
      }
    }
  );
});

// Display all blog posts and show the current user's name
app.get("/blogs", (req, res) => {
  const current_user_id = req.session.user_id;
  const current_username = req.session.username;

  if (!current_user_id) {
    res.redirect("/signin"); // If no user is signed in, redirect to sign-in page
    return;
  }

  // Fetch and display blog posts
  client.query(
    "SELECT * FROM blogs ORDER BY date_created DESC",
    (err, result) => {
      if (err) {
        console.error(err);
        res.send("Error retrieving blog posts.");
      } else {
        // Pass blog posts and current username to the EJS template
        res.render("blogs", {
          blogs: result.rows,
          username: current_username, // Passing current user's name to the template
        });
      }
    }
  );
});

// Route to serve the edit post page with the current post data
app.get("/edit-post/:blog_id", (req, res) => {
  const blog_id = req.params.blog_id;
  const current_user_id = req.session.user_id; // Get the current user from the session

  if (!current_user_id) {
    res.redirect("/signin"); // If the user is not logged in, redirect to sign-in
    return;
  }

  // Fetch the blog post by its ID
  client.query(
    "SELECT * FROM blogs WHERE blog_id = $1",
    [blog_id],
    (err, result) => {
      if (err || result.rows.length === 0) {
        res.send("Blog post not found.");
      } else {
        const post = result.rows[0];

        // Check if the logged-in user is the creator of the post
        if (post.creator_user_id !== current_user_id) {
          res.send("You do not have permission to edit this post.");
        } else {
          // Render the edit post form with the current post data
          res.render("editPost", { blog: post });
        }
      }
    }
  );
});

// Handle the form submission for editing a blog post
app.post("/edit-post/:blog_id", (req, res) => {
  const blog_id = req.params.blog_id;
  const current_user_id = req.session.user_id; // Get the current user from the session
  const { title, body } = req.body;

  if (!current_user_id) {
    res.redirect("/signin"); // Redirect to sign-in page if not logged in
    return;
  }

  // Fetch the blog post to check if the user is the creator
  client.query(
    "SELECT * FROM blogs WHERE blog_id = $1",
    [blog_id],
    (err, result) => {
      if (err || result.rows.length === 0) {
        res.send("Post not found.");
      } else {
        const post = result.rows[0];

        // Check if the logged-in user is the creator of the post
        if (post.creator_user_id !== current_user_id) {
          res.send("You do not have permission to edit this post.");
        } else {
          // If the user is the creator, update the post
          client.query(
            "UPDATE blogs SET title = $1, body = $2 WHERE blog_id = $3",
            [title, body, blog_id],
            (err) => {
              if (err) {
                console.error(err);
                res.send("Error updating blog post.");
              } else {
                // Redirect back to the blog list after successful update
                res.redirect("/blogs");
              }
            }
          );
        }
      }
    }
  );
});

app.get("/delete-post/:blog_id", (req, res) => {
  const blog_id = req.params.blog_id;
  const current_user_id = req.session.user_id;

  if (!current_user_id) {
    res.redirect("/signin");
    return;
  }

  // Check if the current user is the creator of the post
  client.query(
    "SELECT * FROM blogs WHERE blog_id = $1",
    [blog_id],
    (err, result) => {
      if (err || result.rows.length === 0) {
        res.send("Post not found.");
      } else {
        const post = result.rows[0];
        if (post.creator_user_id !== current_user_id) {
          res.send("You do not have permission to delete this post.");
        } else {
          // Delete the post
          client.query(
            "DELETE FROM blogs WHERE blog_id = $1",
            [blog_id],
            (err) => {
              if (err) {
                console.error(err);
                res.send("Error deleting blog post.");
              } else {
                res.redirect("/blogs");
              }
            }
          );
        }
      }
    }
  );
});

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log("Server is running on port 3000");
});
