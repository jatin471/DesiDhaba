const functions = require("firebase-functions")
const admin = require("firebase-admin")
require('dotenv').config()

const serviceAccountKey = require("./serviceAccountKey.json")

const express = require("express")
const app = express()

app.use(express.json())

const cors = require("cors")
app.use(cors({origin:true}))
app.use((req,res,next)=>{
    res.set("Access-Control-Allow-Origin","*")
    next()
})

// Firebase Credentials


admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey)
  });


app.get("/",(req,res)=>{
    return res.send("Hello World");
})


const userRoute = require("./routes/userRoute")
app.use("/api/users",userRoute)

const productRoute = require("./routes/productRoute")
app.use("/api/products",productRoute)



exports.app = functions.https.onRequest(app)