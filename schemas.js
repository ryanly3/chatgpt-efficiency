const mongoose = require('mongoose')
const schema = mongoose.Schema;

const Data_Schema = new schema ({
    question: {
        type : String,
        required : true,
        unique: true
    },
    OptionA : {
        type: String,
        required: true
    },
    OptionB : {
        type: String,
        required: true
    },
    OptionC : {
        type: String,
        required: true
    },
    OptionD : {
        type: String,
        required: true
    },
    Expected_answer:{
        type: String,
        required: true
    },
    ChatGPT_Response : {
        type: String,
        default: null
    },
    response_time: {
        type: Number,
        default: null
    },
    is_answered: {
        type: Boolean,
        default: false
    },
    is_correct: {
        type: Boolean,
        default: null
    }
});

module.exports = Data_Schema;