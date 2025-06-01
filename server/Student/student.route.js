const {getAllS, getOne, postS, putS, deleteS} = require("./student.controller");

const express = require('express');
const router = express.Router();

router.route('/').get(getAllS).post(postS)
router.route('/:id').get(getOne).put(putS).delete(deleteS);


module.exports = router;