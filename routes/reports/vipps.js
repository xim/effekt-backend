const vippsParser = require('../../custom_modules/parsers/vipps.js')
const DAO = require('../../custom_modules/DAO.js')
const mail = require('../../custom_modules/mail')
const config = require('../../config')

const VIPPS_ID = 4

module.exports = async (req,res,next) => {
    if (!req.files || !req.files.report) return res.sendStatus(400)

    try {
        parsedReport = vippsParser.parseReport(req.files.report.data)
        parsingRules = await DAO.parsing.getVippsParsingRules(parsedReport.minDate, parsedReport.maxDate)
    }
    catch(ex) {
        next(ex)
        return false
    }

    let transactions = parsedReport.transactions
    let invalid = []
    let valid = 0
    for (let i = 0; i < transactions.length; i++) {
        let transaction = transactions[i]

        if (transaction.KID != null) {
            /**
             * Managed to grab a KID straight from the message field, go ahead and add to DB
             */
            let donationID;
            try {
                donationID = await DAO.donations.add(transaction.KID, VIPPS_ID, transaction.amount, transaction.date.toDate(), transaction.transactionID)
                valid++
            } catch (ex) {
                console.error("Failed to update DB for vipps donation with KID: " + transaction.KID)
                console.error(ex)

                invalid.push({
                    reason: ex,
                    transaction: transaction
                })
            }

            try {
                if (config.env === 'production') mail.sendDonationReciept(donationID);
            } catch (ex) {
                console.error("Failed to send donation reciept")
                console.error(ex)
            }
        } else if ((matchingRuleKID = checkForMatchingParsingRule(transaction, parsingRules)) != false) {
            /**
             * Transaction matched against a parsing rule
             * An example could be the rule that "if the message says vipps, we automaticly assume standard split"
             * The rules are defined in the database
             */
            try {
                await DAO.donations.add(matchingRuleKID, VIPPS_ID, transaction.amount, transaction.date.toDate(), transaction.transactionID)
                valid++
            } catch (ex) {
                console.error("Failed to update DB for vipps donation that matched against a parsing rule with KID: " + transaction.KID)
                console.error(ex)

                invalid.push({
                    reason: ex,
                    transaction: transaction
                })
            }
        } else  {
            invalid.push({
                reason: "Could not find valid KID or matching parsing rule",
                transaction: transaction
            })
        }
    }

    res.json({
        status: 200,
        content: {
        valid: valid,
        invalid: invalid.length,
        invalidTransactions: invalid
        }
    })
}

function checkForMatchingParsingRule(transaction, rules) {
    for (let i = 0; i < rules.length; i++) {
        let rule = rules[i]
        if (rule.salesLocation == transaction.location && rule.message == transaction.message) return rule.resolveKID
        if (rule.salesLocation == transaction.location && rule.message == null) return rule.resolveKID
    }
    return false
}