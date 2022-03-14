#!/usr/bin/env node


// Todo: Move connection string to env file. 
// Todo: Work with the API to fetch the data for this company name. 
// Todo: Save data to MongoDB

var amqp = require('amqplib/callback_api');
const NewsAPI = require('newsapi');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config(({ path: '.env.local' }));

const MONGODB_URI = process.env.MONGODB_URI
const RABBITMQ_URI = process.env.RABBITMQ_URI
const NEWS_API_KEY = process.env.NEWS_API_KEY


if (!RABBITMQ_URI || !MONGODB_URI || !NEWS_API_KEY) {
  throw new Error('Please specify the RABBITMQ_URI, MONGODB_URI and NEWS_API_KEY')
}


const getNews = (company) => {
  const newsapi = new NewsAPI(NEWS_API_KEY);
  console.log("looking for news about " + company)
  newsapi.v2.topHeadlines({
    q: company,
    category: 'business',
    language: 'en',
  }).then(response => {
    console.log(response);
    if (response.articles && response.articles.length) {
      saveToMongoDB(company, response.articles)
    }
    /*
      {
        status: "ok",
        articles: [...]
      }
    */
  });
}


async function saveToMongoDB(company, articles) {
  await mongoose.connect(MONGODB_URI);

  const newsForCompany = { company: company, articles: articles }

  const NewsSchema = new mongoose.Schema({
    company: String,
    articles: {
      title: String,
      description: String,
      url: String
    }
  })

  const News = mongoose.model("News", NewsSchema)



  News.findOneAndUpdate(
    { company: company }, // find a document with that filter
    newsForCompany, // document to insert when nothing was found
    { upsert: true, new: true, runValidators: true }, // options
    function (err, doc) { // callback
      if (err) {
        console.log(err)
        // handle error
      } else {
        console.log("successfully written news for " + company)
        // handle document
      }
    }
  );
  return true;

}


amqp.connect(RABBITMQ_URI, function (error0, connection) {
  if (error0) {
    throw error0;
  }
  connection.createChannel(function (error1, channel) {
    if (error1) {
      throw error1;
    }

    var queue = 'clients';

    channel.assertQueue(queue, {
      durable: false
    });

    console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", queue);

    channel.consume(queue, function (msg) {
      console.log(" [x] Received %s", msg.content.toString());
      getNews(msg.content.toString())
    }, {
      noAck: true
    });
  });
});