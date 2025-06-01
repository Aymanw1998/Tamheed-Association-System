//server
const Schema = require("./student.model")

const buildStudentData = (body) => ({
    tz: body.tz,
    firstname: body.firstname,
    lastname: body.lastname,
    birth_date: body.birth_date,
    gender: body.gender,
    phone: body.phone,
    email: body.email,
    father_name: body.father_name,
    mother_name: body.mother_name,
    father_phone: body.father_phone,
    mother_phone: body.mother_phone,
    city: body.city,
    street: body.street,
    image_url: body.image_url,
});


const getAllS = async(req, res) => {
    console.log("start-getAllPost")
    try{
        const schema = await Schema.find();
        console.log("schema", schema, schema.length);
        return schema.length > 0 ? res.status(200).json({schema}) : res.status(404).json([]);
    }
    catch(err){
        console.log(`err: ${err}`.red)
        return res.status(500).json([]);
    }
}

const getOne = async (req, res) => {
  console.log("start-getOne")
    try{
        const schema = await Schema.findOne({tz: req.params.id});
        console.log("schema", schema);
        return schema ? res.status(200).json({schema}) : res.status(404).json([]);
    }
    catch(err){
        console.log(`err: ${err}`.red)
        return res.status(500).json([]);
    }
}
const postS = async(req, res) => {
    console.log("start-create-schema-student")
    try{
        const model = buildStudentData(req.body) 
        const isFind = await Schema.find({tz: model.tz})
        console.log("schema body", req.body, isFind.length)
        if(isFind.length > 0){
            return res.status(301).json({warning: "يوجد طالب مع رقم الهوية ذاتها"});

        }
        console.log("create model student")
        const schema = new Schema({...model,create: new Date()});
        console.log("create student in database")
        await schema.save();

        const schemaFind = await Schema.find();
        return schemaFind ? res.status(201).json({schema: schemaFind}): res.status(404).json([]);
    }
    catch(err){
        console.log(`err: ${err}`.red)
        return res.status(500).json([]);
    }
}

const putS = async(req, res) => {
    console.log("start-update-schema-student")
    try{
        const model = buildStudentData(req.body) 
        const isFindBytz = await Schema.findOne({tz: req.params.id});

        if(!isFindBytz){
            return res.status(301).json({warning: "لا يوجد معلومات حول الطالب المطلوب"});
        }
        
        const schema = await Schema.findOneAndUpdate({tz: req.params.id}, model)
        const schemaFind = await Schema.find();
        return schemaFind ? res.status(200).json({schema:schemaFind}): res.status(404).json([]);
    }
    catch(err){
        console.log(`err: ${err}`.red)
        return res.status(500).json([]);
    }
}
const deleteS= async(req, res) => {
    console.log("start-delete-schema-student")
    try{
        const {id} = req.params;
        console.log("id:", id);
        await Schema.findOneAndDelete({tz: id}); 
        const schemaFind = await Schema.find();
        return schemaFind ? res.status(200).json({schema: schemaFind}): res.status(404).json([]);
    }
    catch(err){
        console.log(`err: ${err}`.red)
        return res.status(500).json([]);
    }
}
module.exports = {getAllS, getOne, postS, putS, deleteS}