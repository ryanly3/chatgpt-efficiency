const OpenAI = require("openai");
require("dotenv").config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const csv = require('csv-parser');
const fs = require ('fs');
const {History_Model, Social_Science_Model, Computer_Security_Model} = require('./model')
const openAI = require('openai');
const WebSocket = require('ws');
const cors = require ('cors');


const port = 3000;
const app = express();
//Starting http server
const server = http.createServer(app);

// ---- WebSocket Server ----
const wss = new WebSocket.Server({server});

app.use(cors());
app.use(express.static('public'))

//Creating constants/initializing
const dbURI = 'mongodb+srv://RyanLy:ITEC4020RyanLy@itec4020.0b7wxvk.mongodb.net/ChatGPT_Evaluation?appName=ITEC4020';//Making sure to choose the specific DB that I want to insert data
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY
});
const ChatGPT_Model = 'gpt-4o'
const retries = 3;

wss.on("connection", (socket) => {
  console.log("Client connected");

  socket.send("WebSocket connection established!");

  socket.on("message", (msg) => {
    console.log("Received:", msg);
    socket.send("Server received: " + msg);
  });
});

const broadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

//Mapping each CSV to their respective models, useful later when populating DB
const fileToModelMap = {
    'prehistory_test.csv': History_Model,
    'sociology_test.csv': Social_Science_Model,
    'computer_security_test.csv': Computer_Security_Model,
};

//Parsing the csv data provided, used when populating the database
const readCsvData = (fileName) => {
    //Checking for file name, (the file that contains the dataset)
    return new Promise((resolve, reject) => {
        const filePath = path.join(__dirname, 'ITEC4020_dataset', fileName);
        const results = [];

        //Check if file exists before reading
        if (!fs.existsSync(filePath)) {
            console.error(`ERROR: CSV file not found at ${filePath}`);
            return resolve([]); // Resolve with empty array if file not found
        }

        fs.createReadStream(filePath)
            //Setting the default headers that aren't present in the CSV
            .pipe(csv({ headers: false }))
            .on('data', (data) => {
                // Mapping the columns (data[0], data[1], etc.) to the required schema fields.
                const questionData = {
                    question: data[0],
                    OptionA: data[1],
                    OptionB: data[2],
                    OptionC: data[3],
                    OptionD: data[4],
                    Expected_answer: data[5]
                    //Other fields (ChatGPT_Response, is_answered) will use their default values from the schema
                    //They will be updated when we record Chatgpt's response is recorded/further evaluation
            .on('end', () => {
                console.log(`Successfully read ${results.length} records from ${fileName}.`);
                resolve(results);
            })
            .on('error', (err) => {
                console.error(`Error reading ${fileName}:`, err);
                reject(err);
            })
        };
    })
});
}
//Populating our database, checks if collection has entries before populating, skips if already populated
const populate = async () => {
    broadcast({message:'Checking Database'});
    console.log('Database Population Check');
    let needsPopulation = false;
    
    // Iterate over each file/model pair
    for (const [fileName, Model] of Object.entries(fileToModelMap)) {
        const collectionName = Model.collection.collectionName; // Get the collection name
        try {
            // Check if the collection is empty
            const count = await Model.countDocuments();
            
            if (count === 0) {
                console.log(`Collection '${collectionName}' is empty. Reading data from ${fileName}...`);
                
                // Read the data from the CSV file
                const dataToInsert = await readCsvData(fileName);

                if (dataToInsert.length > 0) {
                    //Insert the data
                    await Model.insertMany(dataToInsert);
                    console.log(`Successfully inserted ${dataToInsert.length} questions into '${collectionName}'.`);
                    needsPopulation = true;
                } else {
                    console.warn(`Invalid data found in ${fileName}. Skipping insertion for ${collectionName}.`);
                }

            } else {
                console.log(`Collection '${collectionName}' already contains ${count} documents. Skipping population.`);
            }
        } catch (err) {
            console.error(`Error populating collection ${collectionName} with file ${fileName}:`, err);
        }
    }

    if (needsPopulation) {
        broadcast({message:'Database Filled'});
        console.log('Initial population from files complete.');
    } else {
        broadcast({message:'Database Contains Data, No need to fill'});
        console.log('All collections contain data. Population skipped.');
    }
};
//Method to prompt chatGPT
const promptChatGPT = async (question) => {
    
    const prompt = `Question: ${question.question}
                    A. ${question.OptionA}
                    B. ${question.OptionB}
                    C. ${question.OptionC}
                    D. ${question.OptionD}`;

    const payload = {
        model: ChatGPT_Model,
        messages: [
            {
                role: "system", 
                content: "Only respond with a single letter (A, B, C, or D) that represents the option that is most correct."
            },
            {
                role: "user", 
                content: prompt
            }
        ],
        temperature: 0.1, //Set to a low value for deterministic answers
        max_tokens: 5,   //Keep the response small  
    };

    for (let attempt = 0; attempt < retries; attempt++) {
        const delay = Math.pow(2, attempt) * 1000; 
        
        try {
            const startTime = process.hrtime.bigint();
            
            //Call the API using the initialized client
            const completion = await openai.chat.completions.create(payload);

            const endTime = process.hrtime.bigint();
            //Calculate response time in milliseconds
            const responseTimeMs = Number(endTime - startTime) / 1000000;
            
            //ChatGPT's response
            const responseText = completion.choices[0].message.content.trim();

            //Return it's response, and it's response time
            if (responseText) {
                return { response: responseText, response_time: responseTimeMs };
            } else {
                // If API returns successfully but with no response text
                throw new Error("OpenAI API returned empty content.");
            }
        } catch (error) {

            console.error(`Attempt ${attempt + 1} failed for question: ${error.message}`);
            if (attempt < retries - 1) {
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {

                throw new Error(`Failed to call OpenAI API after ${retries} attempts. Error: ${error.message}`);
            }
        }
    }
};
//Method to look for unanswered questions in our database
const processUnansweredQuestions = async () => { 
    console.log('\n Starting Processing of Questions Unanswered');
    let totalProcessed = 0;
    const Models = Object.values(fileToModelMap);
    
    broadcast({message:'Question Processing Started'});
    console.log('Processing started');

    // Iterate over all models to process each collection
    for (const Model of Models) {
        const collectionName = Model.collection.collectionName;

        try {
            // Find documents where is_answered is false
            const questions = await Model.find({ is_answered: false });

            if (questions.length === 0) {
                console.log(`Collection ${collectionName}: No new questions to process.`);
                continue;
            }

            console.log(`Collection ${collectionName}: Found ${questions.length} unanswered questions. Prompting ChatGPT..`);

            for (const question of questions) {
                try {
                    // Call the ChatGPT API
                    const result = await promptChatGPT(question); 
                    const GPTresponse = result.response.toUpperCase(); // Ensure we are working with A, B, C, or D

                    // Checking if response has anything other than letters
                    if (!['A', 'B', 'C', 'D'].includes(GPTresponse)) {
                        //Don't update database if 
                        console.warn(`[Warning] Invalid response for QID ${question._id}: "${GPTresponse}". Skipping update.`);
                        continue; 
                    }

                    // Prepare the update object
                    const updateData = {
                        ChatGPT_Response: GPTresponse,
                        response_time: result.response_time,
                        is_answered: true,
                    };

                    // Update the document in the database
                    await Model.findByIdAndUpdate(question._id, updateData, { new: true });
                    totalProcessed++;
                    

                    const message = `Processed QID ${question._id} in ${collectionName} in ${result.response_time.toFixed(2)}ms. Response: ${GPTresponse}`;
                    console.log(message);

                } catch (apiError) {
                    console.error(`Failed to process question ${question._id} in ${collectionName}: ${apiError.message}`);

                    broadcast({message:`Failed to process question ${question._id} in ${collectionName}: ${apiError.message}`});
                }
            }
        } catch (dbError) {
            console.error(`Error querying database for ${collectionName}: ${dbError.message}`);
        }
    }
    
    console.log(`Processing Complete. Total Questions Processed: ${totalProcessed}.`);

    broadcast({message:'Question Processing Complete'});
    console.log(`\nProcessing Complete. Total Questions Processed: ${totalProcessed}`);
};

//Function for the query validation api, match collection name with one of the names in the model map
const getCollectionName = (collectionName) => {
    //Looping through model map to find the collection name
    for (const Model of Object.values(fileToModelMap)) {
        //If it exists, return the model name, otherwise return null
        if (Model.collection.collectionName === collectionName) {
            return Model;
        }
    }
    return null;
};

// ---- Middleware route /api/add ----
app.get("/api/add", (req, res) => {
  const a = Number(req.query.a);
  const b = Number(req.query.b);

  if (isNaN(a) || isNaN(b)) {
    return res.json({ error: "Invalid inputs" });
  }

  res.json({ result: a + b });
});

// --------------------------
// /api/results
// Returns accuracy + timing per domain
// --------------------------
app.get('/api/results', async (req, res) => {
  try {
    const domains = [
      { name: 'History', Model: History_Model },
      { name: 'Social_Science', Model: Social_Science_Model },
      { name: 'Computer_Security', Model: Computer_Security_Model },
    ];

    const normalizeLetter = (val) => {
      if (!val) return null;
      const match = String(val).toUpperCase().match(/[ABCD]/);
      return match ? match[0] : null;
    };

    const domainResults = [];

    let overallTotal = 0;
    let overallCorrect = 0;
    let overallTimeSum = 0;
    let overallTimeCount = 0;

    for (const { name, Model } of domains) {
      const docs = await Model.find({ is_answered: true })
        .select('Expected_answer ChatGPT_Response response_time');

      const totalQuestions = docs.length;
      let totalCorrect = 0;
      let timeSum = 0;
      let timeCount = 0;

      docs.forEach((doc) => {
        const expected = normalizeLetter(doc.Expected_answer);
        const got = normalizeLetter(doc.ChatGPT_Response);

        if (expected && got && expected === got) {
          totalCorrect++;
        }

        if (typeof doc.response_time === 'number') {
          timeSum += doc.response_time;
          timeCount++;
        }
      });

      const accuracy = totalQuestions ? (totalCorrect / totalQuestions) * 100 : 0;
      const avgResponseTime = timeCount ? timeSum / timeCount : null;

      overallTotal += totalQuestions;
      overallCorrect += totalCorrect;
      overallTimeSum += timeSum;
      overallTimeCount += timeCount;

      domainResults.push({
        domain: name,
        totalQuestions,
        totalCorrect,
        accuracy,
        avgResponseTime,
      });
    }

    const overallAccuracy = overallTotal
      ? (overallCorrect / overallTotal) * 100
      : 0;

    const overallAvgResponseTime = overallTimeCount
      ? overallTimeSum / overallTimeCount
      : null;

    res.json({
      domains: domainResults,
      overall: {
        totalQuestions: overallTotal,
        totalCorrect: overallCorrect,
        accuracy: overallAccuracy,
        avgResponseTime: overallAvgResponseTime,
      },
    });
  } catch (err) {
    console.error('Error computing /api/results:', err);
    res.status(500).json({ error: 'Failed to compute evaluation results.' });
  }
});

//Query validation api, insert collection name, return questions, options, chatgpt response, and expected answer
app.get('/api/questions/:collectionName', async (req, res) => {
    const collectionName = req.params.collectionName;

    const Model = getCollectionName(collectionName);

    //Input Validation: Check if the collection name is supported by checking if Model is null
    if (!Model) {
        return res.status(400).json({ 
            error: `Invalid collection name: ${collectionName}. Must be one of: History, Computer_Security, and Social_Science}` 
        });
    }

    try {
        //Query all documents in the collection, selecting certain fields
        const allQuestions = await Model.find({}).select('question OptionA OptionB OptionC OptionD ChatGPT_Response Expected_answer'); 

        res.status(200).json({
            collection: collectionName,
            totalQuestions: allQuestions.length,
            questions: allQuestions.map(q => ({
                question: q.question,
                A: q.OptionA,
                B: q.OptionB,
                C: q.OptionC,
                D: q.OptionD,
                Response: q.ChatGPT_Response,
                CorrectAnswer: q.Expected_answer
            }))
        });

    } catch (err) {
        console.error(`Database error when fetching questions from ${collectionName}:`, err);
        res.status(500).json({ error: `Failed to retrieve questions from the ${collectionName} collection.` });
    }
});

mongoose.connect(dbURI)
//Nothing happens unless the connection to the DB is successful
    .then(async (result)=>{

        console.log('Connected to database');

        //Checking if collections are empty first, populated if needed, otherwise process unanswered questions
        await populate();

        //Commenting out so that we don't cost the prof too much money
        //********processUnansweredQuestions();//Can uncomment if you want to see how it works/want to update the answers chatgpt provides
        // 556 answered correctly with only 1 letter, 44 with more than one letter and were skipped, could include that in evaluation metrics

        server.listen(port, () =>{
            console.log('Server listening on http://localhost:3000');
        })
    })
    .catch((err)=>console.log('Connection Failed'));
