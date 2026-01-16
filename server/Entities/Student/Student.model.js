const mongoose = require('mongoose');

const bcrypt = require('bcryptjs');
const { StudentInterface } = require('../Person/Person.interface');

const StudentSchema = new mongoose.Schema({...StudentInterface,
    main_teacher: {type:mongoose.Schema.Types.ObjectId, ref: 'Users', default: null},
    source: {type: String, enum:['جمعية', 'اهل'], default: 'جمعية'},
    status: {type: String, enum:['عادي', 'ينتظر'], default: 'عادي'}
}, {timestamps: true} );

StudentSchema.index({ tz: 1 }, { unique: true });

const Student = mongoose.model('Students', StudentSchema);
module.exports = Student;
