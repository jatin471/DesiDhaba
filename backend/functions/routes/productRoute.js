const router = require("express").Router();
const admin = require("firebase-admin");
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
const stripe = require("stripe")(process.env.STRIPE_KEY);
const express = require("express");

router.post("/create", async (req, res) => {
  try {
    const id = Date.now();
    const data = {
      product_id: id,
      product_name: req.body.product_name,
      product_category: req.body.product_category,
      product_price: req.body.product_price,
      imageURL: req.body.imageURL,
    };
    const response = await db.collection("products").doc(`/${id}`).set(data);
    return res.status(200).send({ success: true, data: response });
  } catch (error) {
    res.send({ success: false, message: `Error : ${error}` });
  }
});

router.get("/all", async (req, res) => {
  try {
    let query = await db.collection("products").get();
    let response = [];
    query.forEach((doc) => {
      response.push(doc.data());
    });
    return res.status(200).send({ success: true, data: response });
  } catch (err) {
    return res.send({ success: false, msg: `Error: ${err}` });
  }
});

router.delete("/delete/:productId", async (req, res) => {
  const productId = req.params.productId;
  try {
    await db
      .collection("products")
      .doc(`/${productId}/`)
      .delete()
      .then((result) => {
        return res.status(200).send({ success: true, data: result });
      });
  } catch (error) {
    return res.send({ success: false, msg: `Error: ${error}` });
  }
});

//create a cart

router.post("/addToCart/:userId", async (req, res) => {
  const userId = req.params.userId;
  const productId = req.body.product_id;

  try {
    const doc = await db
      .collection("cartItems")
      .doc(`/${userId}`)
      .collection("items")
      .doc(`/${productId}`)
      .get();

    if (doc.data()) {
      const quantity = doc.data().quantity + 1;
      const updatedItem = await db
        .collection("cartItems")
        .doc(`/${userId}`)
        .collection("items")
        .doc(`/${productId}`)
        .update({ quantity });
      return res.status(200).send({ success: true, data: updatedItem });
    } else {
      const data = {
        product_id: req.body.product_id,
        product_name: req.body.product_name,
        product_category: req.body.product_category,
        product_price: req.body.product_price,
        imageURL: req.body.imageURL,
        quantity: 1,
      };
      const addItems = await db
        .collection("cartItems")
        .doc(`/${userId}`)
        .collection("items")
        .doc(`/${productId}`)
        .set(data);
      return res.status(200).send({ success: true, data: addItems });
    }
  } catch (error) {
    return res.send({ success: false, msg: `Error: ${error}` });
  }
});

//Get All Cart Items For The User

router.get("/getCartItems/:user_id", async (req, res) => {
  const userId = req.params.user_id;
  try {
    let query = await db
      .collection("cartItems")
      .doc(`/${userId}`)
      .collection("items");
    let response = [];

    await query.get().then((querysnap) => {
      let docs = querysnap.docs;

      docs.map((doc) => {
        response.push({ ...doc.data() });
      });
      return response;
    });

    return res.status(200).send({ success: true, data: response });
  } catch (err) {
    return res.send({ success: false, msg: `Error: ${err}` });
  }
});

//update cart to increase item

router.post("/updatedCart/:user_id", async (req, res) => {
  const userId = req.params.user_id;
  const productId = req.query.product_id;
  const type = req.query.type;

  try {
    const doc = await db
      .collection("cartItems")
      .doc(`/${userId}`)
      .collection("items")
      .doc(`/${productId}`)
      .get();

    if (doc.data()) {
      if (type === "increment") {
        const quantity = doc.data().quantity + 1;
        const updatedItem = await db
          .collection("cartItems")
          .doc(`/${userId}`)
          .collection("items")
          .doc(`/${productId}`)
          .update({ quantity });
        return res.status(200).send({ success: true, data: updatedItem });
      } else {
        if (doc.data().quantity === 1) {
          await db
            .collection("cartItems")
            .doc(`/${userId}`)
            .collection("items")
            .doc(`/${productId}`)
            .delete()
            .then((result) => {
              return res.status(200).send({ success: true, data: result });
            });
        } else {
          const quantity = doc.data().quantity - 1;
          const updatedItem = await db
            .collection("cartItems")
            .doc(`/${userId}`)
            .collection("items")
            .doc(`/${productId}`)
            .update({ quantity });
          return res.status(200).send({ success: true, data: updatedItem });
        }
      }
    }
  } catch (error) {
    return res.send({ success: false, msg: `Error: ${error}` });
  }
});

router.post("/create-checkout-session", async (req, res) => {
  const customer = await stripe.customers.create({
    metadata: {
      user_id: req.body.data.user.user_id,
      cart: JSON.stringify(req.body.data.cart),
      total: req.body.data.cart.total,
    },
  });

  const line_items = req.body.data.cart.map((item) => {
    return {
      price_data: {
        currency: "inr",
        product_data: {
          name: item.product_name,
          images: [item.imageURL],
          metadata: {
            id: item.product_id,
          },
        },
        unit_amount: item.product_price * 100,
      },
      quantity: item.quantity,
    };
  });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    shipping_address_collection: { allowed_countries: ["IN"] },

    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: 0, currency: "inr" },
          display_name: "Free Shipping",
          delivery_estimate: {
            minimum: { unit: "hour", value: 2 },
            maximum: { unit: "hour", value: 4 },
          },
        },
      },
    ],
    phone_number_collection: {
      enabled: true,
    },
    line_items: line_items,
    mode: "payment",
    customer: customer.id,
    success_url: `${process.env.CLIENT_URL}/checkout-success`,
    cancel_url: `${process.env.CLIENT_URL}/`,
  });

  res.send({ url: session.url });
});

let endpointSecret;

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let eventType;
    let data;

    if (endpointSecret) {
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }
      data = event.data.object;
      eventType = req.body.type;
    } else {
      data = req.body.data.object;
      eventType = req.body.type;
    }

    // Handle the event
    if (eventType === "checkout.session.completed") {
      stripe.customers.retrieve(data.customer).then((customer) => {
        console.log(customer)
        createOrder(customer, data, res);
      });
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send().end();
  }
);

const createOrder = async (customer, intent , res) => {
  
  try {
    const orderId = Date.now();
    const data = {
      intentId: intent.id,
      orderId: orderId,
      amount: intent.amount_total,
      created: intent.created,
      payment_method_types: intent.payment_method_types,
      status: intent.payment_status,
      customer: intent.customer_details,
      shipping_details: intent.shipping_details,
      userId: customer.metadata.user_id,
      items: JSON.parse(customer.metadata.cart),
      total: customer.metadata.total,
      sts: "preparing",
    };
    await db.collection("orders").doc(`/${orderId}/`).set(data);

    deleteCart(customer.metadata.user_id ,JSON.parse(customer.metadata.cart));
    return res.status(200).send({success:true})

  } catch (err) {}
};

const deleteCart = async(userId ,items)=>{
  
  items.map(async(data)=>{
     await db
      .collection("cartItems")
      .doc(`/${userId}`)
      .collection("items")
      .doc(`/${data.product_id}/`)
      .delete()
  })
}

router.get("/orders", async (req, res) => {
  try {
    let query = await db.collection("orders").get();
    let response = [];
    query.forEach((doc) => {
      response.push(doc.data());
    });
    return res.status(200).send({ success: true, data: response });
  } catch (err) {
    return res.send({ success: false, msg: `Error: ${err}` });
  }
});





module.exports = router;
