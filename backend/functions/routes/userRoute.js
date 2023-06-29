const router = require("express").Router();
const admin = require("firebase-admin");
let data = [];

router.get("/", (req, res) => {
  return res.send("Inside The User Router");
});

router.get("/jwtVerification", async (req, res) => {
  if (!req.headers.authorization) {
    return res.status(500).send({ msg: "Token Not Found" });
  }
  const token = req.headers.authorization.split(" ")[1];
  // console.log(res.send({token:token}))
  // return res.status(200).send({token:token})
  try {
    const decodedVal = await admin.auth().verifyIdToken(token);
    if (!decodedVal) {
      return res.status(500).send({ msg: "Unauthorised Access" });
    }
    res.status(200).json({ success: true, data: decodedVal });
  } catch (error) {
    return res.send({
      success: false,
      msg: `Error int extracting the token : ${error}`,
    });
  }
});

const listAllUsers = (nextPageToken) => {
  // List batch of users, 1000 at a time.
  admin
    .auth()
    .listUsers(1000, nextPageToken)
    .then((listUsersResult) => {
      listUsersResult.users.forEach((userRecord) => {
        data.push(userRecord.toJSON());
      });
      if (listUsersResult.pageToken) {
        // List next batch of users.
        listAllUsers(listUsersResult.pageToken);
      }
    })
    .catch((error) => {
      console.log("Error listing users:", error);
    });
};
// Start listing users from the beginning, 1000 at a time.
listAllUsers();

router.get("/all", async (req, res) => {
  listAllUsers();
  try {
    return res.status(200).send({ success: true, data: data, dataCount });
  } catch (error) {
    return res.send({
      success: false,
      msd: `Error in listing users: ${error}`,
    });
  }
});
module.exports = router;
