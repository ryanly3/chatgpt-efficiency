const mongoose = require('mongoose');

const Schema = require('./schemas');

const History_Model = mongoose.model(
    'History_Q', Schema,'History'
)

const Social_Science_Model = mongoose.model(
    'Social_Q',Schema,'Social_Science'
)

const Computer_Security_Model = mongoose.model(
    'Computer_Security_Q',Schema,'Computer_Security'
)

module.exports = {
    History_Model,
    Social_Science_Model,
    Computer_Security_Model
};