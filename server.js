console.log("--------------------------------------------------")
console.log("| gieffektivt.no donation backend (╯°□°）╯︵ ┻━┻ |")
console.log("--------------------------------------------------")
const config = require('./config.js')
console.log("Config loaded")

const express = require('express')
const fileUpload = require('express-fileupload')
const pretty = require('express-prettify')
const path = require('path')
const rateLimit = require('express-rate-limit')
const honeypot = require('honeypot')
const logging = require('./handlers/loggingHandler.js')
const http = require('http')
const hogan = require('hogan-express')
const bearerToken = require('express-bearer-token')

console.log("Top level dependencies loaded")

const DAO = require('./custom_modules/DAO.js')

//Connect to the DB
//If unsucsessfull, quit app
DAO.connect(() => {
  console.log("DAO setup complete")

  const errorHandler = require('./handlers/errorHandler.js')

  //Setup express
  const app = express()

  //Set global application variable root path
  global.appRoot = path.resolve(__dirname)

  //Setup request logging
  logging(app)

  app.get("/", (req, res, next) => {
    res.send("Dr. Livingstone, I presume?")
  })

  //Parse post body
  app.use(express.json());

  //Pretty printing of JSON
  app.use(pretty({
    query: 'pretty'
  }))

  //File upload 
  app.use(fileUpload({
    limits: { fileSize: 10 * 1024 * 1024 } //Probably totally overkill, consider reducing
  }))
  app.enable('trust proxy')

  //Honeypot
  const pot = new honeypot(config.honeypot_api_key)
  app.use((req, res, next) => {
    pot.query(req.ip, function (err, response) {
      if (!response) {
        next()
      } else {
        res.status(403).json({
          status: 403,
          content: "IP blacklisted"
        })
      }
    })
  })

  //Rate limiting
  app.use(new rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, //limit each IP to 50 requests per minute
    delayMs: 0 // disable delaying - full speed until the max limit is reached 
  }))

  //Set cross origin as allowed
  app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS')
    next()
  })

  //Look for bearer tokens
  app.use(bearerToken())

  //Render engine for served views
  app.set('view engine', 'mustache')
  app.set('layout', __dirname + '/views/layout.mustache')

  app.engine('mustache', hogan)

  //Server
  const mainServer = http.createServer(app)
  const websocketsHandler = require('./handlers/websocketsHandler.js')(mainServer)

  //Routes
  const donorsRoute = require('./routes/donors')
  const donationsRoute = require('./routes/donations')
  const distributionsRoute = require('./routes/distributions')
  const organizationsRoute = require('./routes/organizations')
  const reportsRoute = require('./routes/reports')
  const paypalRoute = require('./routes/paypal')(websocketsHandler)
  const vippsRoute = require('./routes/vipps')
  const paymentRoute = require('./routes/payment')
  const csrRoute = require('./routes/csr')
  const referralsRoute = require('./routes/referrals')
  const scheduledRoute = require('./routes/scheduled')
  const authRoute = require('./routes/auth')
  const metaRoute = require('./routes/meta')
  const debugRoute = require('./routes/debug')
  const facebookRoute = require('./routes/facebook')

  app.use('/donors', donorsRoute)
  app.use('/donations', donationsRoute)
  app.use('/distributions', distributionsRoute)
  app.use('/organizations', organizationsRoute)
  app.use('/reports', reportsRoute)
  app.use('/paypal', paypalRoute)
  app.use('/vipps', vippsRoute)
  app.use('/payment', paymentRoute)
  app.use('/csr', csrRoute)
  app.use('/referrals', referralsRoute)
  app.use('/scheduled', scheduledRoute)
  app.use('/auth', authRoute)
  app.use('/meta', metaRoute)
  app.use('/debug', debugRoute)
  app.use('/facebook', facebookRoute)

  app.use('/static', express.static(__dirname + '/static'))
  app.use('/style', express.static(__dirname + '/views/style'))
  app.use('/img', express.static(__dirname + '/views/img'))

  //Error handling
  app.use(errorHandler)

  mainServer.listen(config.port, () => {
    console.log("Main http server listening on port " + config.port + " 📞")

    console.log("Don’t Panic. 🐬")
    console.log("---")
  })
})