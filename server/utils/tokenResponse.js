const jwt = require("jsonwebtoken");
const constants = require("../config/constants");
const { TOKEN } = constants;

//Creats token. function is called at the moment of user login req.
//retuens the generat token jibrish 
//We want the token to be a token for a long time to make it easier for adults to logIn
//or you can login with Google to solve it
//For now, Token is valid for a 30 days
const createToken = (_id, _email, _name, _user, _role, _profile_id, _avatar) => {
    let newToken = jwt.sign({ _id: _id, name: _name, user: _user, email: _email, role: _role, profile_id: _profile_id, avatar: _avatar }, `${TOKEN}`, { expiresIn: "30d" });
    return newToken;
}

exports.createToken = createToken;