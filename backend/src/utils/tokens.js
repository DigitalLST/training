const jwt = require('jsonwebtoken');

function signUser(user) {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}


module.exports = { signUser };
