const config = require('../config.js')
const mysql = require('mysql2/promise')
const rounding = require('./rounding.js')

var con

module.exports = {
    //Setup
    createConnection: async function() {
        con = await mysql.createPool({
            host: config.db_host,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name
        })

        console.log("Connected to DB!")
    },

    //Donors
    donors: {
        getKIDByEmail: function(email) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [result] = await con.execute(`SELECT * FROM Donors where email = ?`, [email])
                } catch (ex) {
                    reject(ex)
                }

                if (result.length > 0) fulfill(result[0].KID)
                else fulfill(null)
            })
        },
        add: function(userObject) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var res = await con.execute(`INSERT INTO Donors (
                        KID,
                        email,
                        first_name,
                        last_name
                    ) VALUES (?,?,?,?)`, 
                    [
                        userObject.KID,
                        userObject.email,
                        userObject.firstName,
                        userObject.lastName
                    ])
                }
                catch(ex) {
                    return reject(ex)
                }
                
                fulfill(res[0].insertId)
            })
        },
        remove: function(userID) {
            return new Promise(async (fulfill, reject) => {
                reject(new Error("Not implemented"))
            })
        },
        getByKID: function(KID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [result] = await con.execute(`SELECT * FROM Donors where KID = ? LIMIT 1`, [KID])
                } catch (ex) {
                    reject(ex)
                }

                if (result.length > 0) fulfill(result[0])
                else fulfill(null)
            })
        }
    },

    //Organizations
    organizations: {
        getByIDs: function(IDs) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute("SELECT * FROM Organizations WHERE ID in (" + ("?,").repeat(IDs.length).slice(0,-1) + ")", IDs)
                }
                catch (ex) {
                    reject(ex)
                }
                
                fulfill(organizations)
            })
        },
        getActive: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute(`SELECT * FROM Organizations WHERE active = 1`)
                }
                catch (ex) {
                    return reject(ex)
                }

                fulfill(organizations.map((org) => {
                    return {
                        id: org.ID,
                        name: org.org_abbriv,
                        shortDesc: org.shortDesc,
                        standardShare: org.std_percentage_share,
                        infoUrl: org.info_url
                    }
                }))
            })
        },
        getStandardSplit: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [standardSplit] = await con.execute(`SELECT * FROM Organizations WHERE std_percentage_share > 0 AND active = 1`)
                }
                catch(ex) {
                    return reject(ex)
                }

                fulfill(standardSplit.map((org) => {
                    return {
                        organizationID: org.ID,
                        name: org.org_full_name,
                        share: org.std_percentage_share
                    }
                }))
            })
        }
    },

    //Donations
    donations: {
        add: function(donationObject) {
            return new Promise(async (fulfill, reject) => {

                //Run checks
                console.log("Trying to round")
                console.log("Rounding")
                if (rounding.sumWithPrecision(donationObject.split.map(split => split.share)) != 100) return reject(new Error("Donation shares do not sum to 100"))
                
                //Insert donation
                try {
                    var [res] = await con.execute(`INSERT INTO Donations (
                            Donor_KID, 
                            sum_notified, 
                            payment_method, 
                            is_own_dist, 
                            is_std_dist
                        ) VALUES (?,?,?,?,?)`,
                        [
                            donationObject.KID,
                            donationObject.amount,
                            "bank",
                            (!donationObject.standardSplit ? 1 : 0),
                            (donationObject.standardSplit ? 1 : 0)
                        ])
                    
                    console.log(res)
                }
                catch(ex) {
                    return reject(ex)
                }
                
                //Insert donation distribution rows
                var donationID = res.insertId

                try {
                    await con.query(`INSERT INTO Donation_distribution (
                        DonationID,
                        OrgID,
                        percentage_share
                    ) VALUES ?`,
                    [
                        donationObject.split.reduce((acc, org) => {
                            acc.push([donationID, org.organizationID, org.share]);
                            return acc
                        }, [])
                    ])
                } 
                catch(ex) {
                    //clean up donation registration
                    try {
                        await con.execute("DELETE FROM Donations WHERE ID = ?", [donationID])
                    } 
                    catch (ex) {
                        console.log("Failed to delete Donation after distribution failed")
                        console.log(ex)
                    }

                    return reject(ex)
                }

                fulfill()
            })
        },
        getByID: function(ID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE ID = ? LIMIT 1`, [ID])
                } catch(ex) {
                    return reject(ex)
                }

                fulfill(donation)
            })
        },
        getStandardShares: function() {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [organizations] = await con.execute(`SELECT 
                        ID, 
                        std_percentage_share 
                        
                        FROM Organizations 
                        
                        WHERE 
                            std_percentage_share > 0 
                            AND 
                            active = 1`)
                } catch(ex) {
                    return reject(ex)
                }

                fulfill(organizations)
            })
        },
        getFullDonationByDonor: function(kid) {
            return new Promise(async (fulfill, reject) => {
                var fullDonations;
                try {
                    var [donations] = await con.execute(`SELECT * FROM Donations WHERE Donor_KID = ?`, [kid])

                    var donationIDs = donations.map((donation) => donation.ID);

                    var [split] = await con.execute(`
                        SELECT orgID, DonationID, percentage_share FROM Donation_distribution 
                        WHERE DonationID IN (` + ("?,").repeat(donationIDs.length).slice(0,-1) + `)`, donationIDs)

                    donations.map((donation) => {
                        var donation = donation;
                        donation.split = split.filter((split) => split.DonationID == donation.ID).map((split) => { delete split.DonationID; return split; })})
                }
                catch(ex) {
                    return reject(ex)
                }

                fulfill(donations)
            })
        },

        getByDonor: function(KID) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donations] = await con.execute(`SELECT * FROM Donations WHERE KID = ?`, [KID])
                }
                catch (ex) {
                    reject(ex)
                }

                fulfill(donation)
            })
        },

        getNonRegisteredByDonors: function(KIDs) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donations] = await con.execute(`SELECT * FROM EffektDonasjonDB.Donations 
                        WHERE 
                        Donor_KID IN (` + ("?,").repeat(KIDs.length).slice(0,-1) + `)
                        AND date_confirmed IS NULL
                        ORDER BY date_notified DESC`, KIDs)
                }
                catch(ex) {
                    reject(ex)
                }

                fulfill(donations)
            })
        },

        registerConfirmedByIDs: function(IDs) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donations] = await con.execute(`UPDATE EffektDonasjonDB.Donations 
                        SET date_confirmed = NOW()
                        WHERE 
                        ID IN (` + ("?,").repeat(IDs.length).slice(0,-1) + `)`, IDs)
                }
                catch(ex) {
                    reject(ex)
                }

                fulfill()
            })
        },

        getFullDonationById: function(id) {
            return new Promise(async (fulfill, reject) => {
                try {
                    var [donation] = await con.execute(`SELECT * FROM Donations WHERE Donor_KID = ? LIMIT 1`, [id])
                    var [split] = await con.execute(`SELECT * FROM Donation_distribution WHERE Dist_DonationID IN ?`, [id])
                }
                catch(ex) {
                    return reject(ex)
                }

                if (donation.length > 0) {
                    donation[0].split = split
                }
                
                fulfill(donation[0])
            })
        },

        getAggregateByTime: function(startTime, endTime) {
            return new Promise(async (fulfill, reject) => {
                
            })
        }
    },
}
