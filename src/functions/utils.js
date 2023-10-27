module.exports = {
  hash: (password) => {
    const saltRounds = 10;
    return bcrypt
      .genSalt(saltRounds)
      .then(salt => {
        return bcrypt.hash(password, salt)
      })
      .catch(err => console.error(err.message))
  }
}