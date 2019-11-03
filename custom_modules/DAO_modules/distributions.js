const sqlString = require('sqlstring')

var con
var DAO

//region GET
async function getAll(page=0, limit=10, sort, filter=null) {
    let where = []
    if (filter) {
        if (filter.KID) where.push(` CAST(KID as CHAR) LIKE ${sqlString.escape(`%${filter.KID}%`)} `)
        if (filter.donor) where.push(` (full_name LIKE ${sqlString.escape(`%${filter.donor}%`)} or email LIKE ${sqlString.escape(`%${filter.donor}%`)}) `)
    }

    let queryString = `
    SELECT
        Combining.KID,
        Donations.sum,
        Donations.count,
        Donors.full_name,
        Donors.email

        FROM Combining_table as Combining

        LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
            ON Donations.KID_fordeling = Combining.KID

        INNER JOIN Donors
            ON Combining.Donor_ID = Donors.ID

        ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}

        GROUP BY Combining.KID, Donors.full_name, Donors.email

        ORDER BY ${sort.id} ${sort.desc ? ' DESC' : ''}

        LIMIT ${sqlString.escape(limit)} OFFSET ${sqlString.escape(limit*page)}`;

    const [rows] = await con.query(queryString)

    const [counter] = await con.query(`
        SELECT COUNT(*) as count 
            FROM Combining_table as Combining

            LEFT JOIN (SELECT sum(sum_confirmed) as sum, count(*) as count, KID_fordeling FROM Donations GROUP BY KID_fordeling) as Donations
                ON Donations.KID_fordeling = Combining.KID

            INNER JOIN Donors
                ON Combining.Donor_ID = Donors.ID

            ${where.length > 0 ? "WHERE " + where.join(" AND ") : ""}`)
    
    const pages = Math.ceil(counter[0].count / limit)

    return {
        rows,
        pages
    };
}

/**
 * Checks whether given KID exists in DB
 * @param {number} KID 
 * @returns {boolean}
 */
function KIDexists(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            var [res] = await con.query("SELECT * FROM Combining_table WHERE KID = ? LIMIT 1", [KID])
        } catch(ex) {
            return reject(ex)
        }

        if (res.length > 0) fulfill(true)
        else fulfill(false)
    })
}

/**
 * Takes in a distribution array and a Donor ID, and returns the KID if the specified distribution exists for the given donor.
 * @param {array<object>} split 
 * @param {number} donorID 
 * @returns {number | null} KID or null if no KID found
 */
function getKIDbySplit(split, donorID) {
    return new Promise(async (fulfill, reject) => {
        //Check if existing KID
        try {
            //Construct query
            let query = `
            SELECT 
                KID, 
                Count(KID) as KID_count 
                
            FROM Distribution as D
                INNER JOIN Combining_table as C 
                    ON C.Distribution_ID = D.ID
            
            WHERE
            `;
            
            for (let i = 0; i < split.length; i++) {
                query += `(OrgID = ${sqlString.escape(split[i].organizationID)} AND percentage_share = ${sqlString.escape(split[i].share)} AND Donor_ID = ${sqlString.escape(donorID)})`
                if (i < split.length-1) query += ` OR `
            }

            query += ` GROUP BY C.KID
            
            HAVING 
                KID_count = ` + split.length

            var [res] = await con.execute(query)
        } catch(ex) {
            return reject(ex)
        }

        if (res.length > 0) fulfill(res[0].KID)
        else fulfill(null)
    })
}

/**
 * Gets organizaitons and distribution share from a KID
 * @param {number} KID 
 */
function getSplitByKID(KID) {
    return new Promise(async (fulfill, reject) => {
        try {
            let [result] = await con.query(`
                SELECT 
                    Organizations.full_name,
                    Organizations.abbriv, 
                    Distribution.percentage_share
                
                FROM Combining_table as Combining
                    INNER JOIN Distribution as Distribution
                        ON Combining.Distribution_ID = Distribution.ID
                    INNER JOIN Organizations as Organizations
                        ON Organizations.ID = Distribution.OrgID
                
                WHERE 
                    KID = ?`, [KID])

            if (result.length == 0) return reject(new Error("No distribution with the KID " + KID))

            return fulfill(result)
        } catch(ex) {
            reject(ex)
        }
    })
}


/**
 * Gets KIDs from historic paypal donors, matching them against a ReferenceTransactionId
 * @param {Array} transactions A list of transactions that must have a ReferenceTransactionId 
 * @returns {Object} Returns an object with referenceTransactionId's as keys and KIDs as values
 */
function getHistoricPaypalSubscriptionKIDS(referenceIDs) {
    return new Promise(async (fulfill, reject) => {
        try {
            let [res] = await con.query(`SELECT 
                ReferenceTransactionNumber,
                KID 
                
                FROM Paypal_historic_distributions 

                WHERE 
                    ReferenceTransactionNumber IN (?);`, [referenceIDs])

            let mapping = res.reduce((acc, row) => {
                acc[row.ReferenceTransactionNumber] = row.KID
                return acc
            }, {})

            fulfill(mapping)
        } catch(ex) {
            reject(ex)
            return false
        }
    })
}
//endregion

//region add
/**
 * Adds a given distribution to the databse, connected to the supplied DonorID and the given KID
 * @param {Array<object>} split 
 * @param {number} KID 
 * @param {number} donorID 
 * @param {number} [metaOwnerID=null] Specifies an owner that the data belongs to (e.g. The Effekt Foundation). Defaults to selection default from DB if none is provided.
 */
function add(split, KID, donorID, metaOwnerID = null) {
    return new Promise(async (fulfill, reject) => {
        try {
            var transaction = await con.startTransaction()

            if (metaOwnerID == null) {
                metaOwnerID = await DAO.meta.getDefaultOwnerID()
            }

            let distribution_table_values = split.map((item) => {return [item.organizationID, item.share]})
            var res = await transaction.query("INSERT INTO Distribution (OrgID, percentage_share) VALUES ?", [distribution_table_values])

            let first_inserted_id = res[0].insertId
            var combining_table_values = Array.apply(null, Array(split.length)).map((item, i) => {return [donorID, first_inserted_id+i, KID, metaOwnerID]})

            //Update combining table
            var res = await transaction.query("INSERT INTO Combining_table (Donor_ID, Distribution_ID, KID, Meta_owner_ID) VALUES ?", [combining_table_values])

            con.commitTransaction(transaction)
            fulfill(true)
        } catch(ex) {
            con.rollbackTransaction(transaction)
            reject(ex)
        }
    })
}
//endregion

module.exports = {
    KIDexists,
    getKIDbySplit,
    getSplitByKID,
    getHistoricPaypalSubscriptionKIDS,
    getAll,

    add,

    setup: (dbPool, DAOObject) => { con = dbPool, DAO = DAOObject }
}