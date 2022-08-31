import { Donor } from "../../schemas/types";
import { DAO } from "../DAO";

//region Get
/**
 * Gets the ID of a Donor based on their email
 * @param {String} email An email
 * @returns {Number} An ID
 */
async function getIDbyEmail(email): Promise<number | null> {
  try {
    var [result] = await DAO.execute(`SELECT ID FROM Donors where email = ?`, [
      email,
    ]);

    if (result.length > 0) return result[0].ID;
    else return null;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Selects a Donor object from the database with the given ID
 * @param {Number} ID The ID in the database for the donor
 * @returns {Donor | null} A donor object
 */
async function getByID(ID): Promise<Donor | null> {
  try {
    var [result] = await DAO.execute(
      `SELECT * FROM Donors where ID = ? LIMIT 1`,
      [ID]
    );

    if (result.length > 0)
      return {
        id: result[0].ID,
        name: result[0].full_name,
        email: result[0].email,
        registered: result[0].date_registered,
        newsletter: result[0].newsletter === 1,
        trash: result[0].trash,
      };
    else return null;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets a donor based on KID
 * @param {Number} KID
 * @returns {Donor | null} A donor Object
 */
async function getByKID(KID): Promise<Donor | null> {
  try {
    let [dbDonor] = await DAO.query(
      `SELECT    
            ID,
            email, 
            full_name,
            date_registered
            
            FROM Donors 
            
            INNER JOIN Combining_table 
                ON Donor_ID = Donors.ID 
                
            WHERE KID = ? 
            GROUP BY Donors.ID LIMIT 1`,
      [KID]
    );

    if (dbDonor.length > 0) {
      return {
        id: dbDonor[0].ID,
        email: dbDonor[0].email,
        name: dbDonor[0].full_name,
        registered: dbDonor[0].date_registered,
      };
    } else {
      return null;
    }
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets the ID of a Donor based on their facebook name
 * If multiple donors with same name exists, return the one with the most recent confirmed donation
 * @param {String} name Donor name from Facebook
 * @returns {Number} Donor ID
 */
async function getIDByMatchedNameFB(name) {
  try {
    var [result] = await DAO.execute(
      `
          SELECT DR.ID, DR.full_name, DR.email, max(DN.timestamp_confirmed) as most_recent_donation FROM Donors as DR
          inner join Donations as DN on DR.ID = DN.Donor_ID
          where DR.full_name = ?
          group by DR.ID
          order by most_recent_donation DESC 
          `,
      [name]
    );

    // Query above does not find donors that have not donated before
    if (result.length == 0) {
      [result] = await DAO.execute(
        `
              SELECT ID FROM Donors
              where full_name = ?
          `,
        [name]
      );
    }

    if (result.length > 0) return result[0].ID;
    else return null;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Gets donorID by agreement_url_code in Vipps_agreements
 * @property {string} agreementUrlCode
 * @return {number} donorID
 */
async function getIDByAgreementCode(agreementUrlCode) {
  let [res] = await DAO.query(
    `
        SELECT donorID FROM Vipps_agreements
        where agreement_url_code = ?
        `,
    [agreementUrlCode]
  );

  if (res.length === 0) return false;
  else return res[0].donorID;
}

/**
 * Searches for a user with either email or name matching the query
 * @param {string} query A query string trying to match agains full name and email
 * @returns {Array<Donor>} An array of donor objects
 */
async function search(query): Promise<Array<Donor>> {
  try {
    if (query === "" || query.length < 3)
      var [result] = await DAO.execute(`SELECT * FROM Donors LIMIT 100`, [
        query,
      ]);
    else
      var [result] = await DAO.execute(
        `SELECT * FROM Donors 
            WHERE 
                MATCH (full_name, email) AGAINST (?)
                OR full_name LIKE ?
                OR email LIKE ?
                
            LIMIT 100`,
        [query, `%${query}%`, `%${query}%`]
      );

    return result.map((donor) => {
      return {
        id: donor.ID,
        name: donor.full_name,
        email: donor.email,
        registered: donor.date_registered,
      };
    });
  } catch (ex) {
    throw ex;
  }
}
//endregion

//region Add
/**
 * Adds a new Donor to the database
 * @param {Donor} donor A donorObject with two properties, email (string) and name(string)
 * @returns {Number} The ID of the new Donor if successfull
 */
async function add(email = "", name, newsletter = null) {
  try {
    var res = await DAO.execute(
      `INSERT INTO Donors (
            email,
            full_name, 
            newsletter
        ) VALUES (?,?,?)`,
      [email, name, newsletter == true]
    );

    return res[0].insertId;
  } catch (ex) {
    throw ex;
  }
}
//endregion

//region Modify

/**
 * Updates donor and sets new newsletter value
 * @param {number} donorID
 * @param {boolean} newsletter
 * @returns {boolean}
 */
async function updateNewsletter(donorID, newsletter) {
  try {
    let res = await DAO.query(`UPDATE Donors SET newsletter = ? where ID = ?`, [
      newsletter,
      donorID,
    ]);
    return true;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Update donor and sets new name value
 * @param {number} donorID
 * @param {string} name
 * @returns {boolean}
 */
async function updateName(donorID, name) {
  try {
    let res = await DAO.query(`UPDATE Donors SET full_name = ? where ID = ?`, [
      name,
      donorID,
    ]);
    return true;
  } catch (ex) {
    throw ex;
  }
}

/**
 * Updates donor information
 * @param {number} donorID
 * @param {string} name
 * @param {boolean} newsletter
 * @returns {boolean}
 */
async function update(donorID, name, newsletter) {
  try {
    let [res] = await DAO.query(
      `UPDATE Donors SET full_name = ?, newsletter = ? where ID = ?`,
      [name, newsletter, donorID]
    );

    if (res.affectedRows === 1) {
      return true;
    }
    return false;
  } catch (ex) {
    throw ex;
  }
}
//endregion

//region Delete
/**
 * Deletes donor from database
 * @param {number} donorID
 */
async function deleteById(donorID) {
  try {
    await DAO.query(`DELETE FROM Donors WHERE ID = ?`, [donorID]);

    return;
  } catch (ex) {
    throw ex;
  }
}
//endregion

export const donors = {
  getByID,
  getIDbyEmail,
  getByKID,
  getIDByMatchedNameFB,
  getIDByAgreementCode,
  search,
  add,
  updateNewsletter,
  updateName,
  update,
  deleteById,
};
