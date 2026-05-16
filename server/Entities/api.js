const axios = require("axios");

const GLOBAL_DB_API_BASE = `${process.env.API_URI}/api/data` || "http://SERVER_IP:5000/api/data";
const GLOBAL_DB_API_TOKEN = process.env.GLOBAL_DB_API_TOKEN || "";

const apiT = axios.create({
  baseURL: GLOBAL_DB_API_BASE,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    ...(GLOBAL_DB_API_TOKEN
      ? { Authorization: `Bearer ${GLOBAL_DB_API_TOKEN}` }
      : {}),
  },
});

const normalizeError = (error) => {
  return {
    success: false,
    error:
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Request failed",
    status: error.response?.status || 500,
    data: error.response?.data || null,
  };
};

const api = {
  async create({ dbName, collection, data }) {
    try {
      const res = await apiT.post("/create", {
        dbName,
        collection,
        data,
      });
      return res.data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async read({ dbName, collection, filter = {} }) {
    try {
      const res = await apiT.post("/read", {
        dbName,
        collection,
        filter,
      });
      return res.data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async update({ dbName, collection, filter, newData }) {
    try {
      const res = await apiT.post("/update", {
        dbName,
        collection,
        filter,
        updateData: newData,
      });
      return res.data;
    } catch (error) {
      throw normalizeError(error);
    }
  },

  async delete({ dbName, collection, filter }) {
    try {
      const res = await apiT.post("/delete", {
        dbName,
        collection,
        filter,
      });
      return res.data;
    } catch (error) {
      throw normalizeError(error);
    }
  },
};

module.exports = api;

// OLD CODE - DO NOT SUGGEST CHANGES
// module.exports = axios.create({
//     baseURL: process.env.API_URI,
// ملاحظة عربية
//     timeout: 15000,
// });
//
// const axios = require("axios");
//
// const GLOBAL_DB_API_BASE = process.env.API_URI || "http://SERVER_IP:5000/api/data";
// const GLOBAL_DB_API_TOKEN = process.env.GLOBAL_DB_API_TOKEN || "";
//
// const apiT = axios.create({
//     baseURL: GLOBAL_DB_API_BASE,
//     timeout: 15000,
//     headers: {
//         "Content-Type": "application/json",
//         ...(GLOBAL_DB_API_TOKEN
//         ? { Authorization: `Bearer ${GLOBAL_DB_API_TOKEN}` }
//         : {}),
//     },
// });
//
// const normalizeError = (error) => {
//     return {
//         success: false,
//         error:
//         error.response?.data?.error ||
//         error.response?.data?.message ||
//         error.message ||
//         "Request failed",
//         status: error.response?.status || 500,
//         data: error.response?.data || null,
//     };
// };
//
// const api = {
//     async create({ dbName, collection, data }) {
//         try {
//         const res = await apiTpost("/create", {
//             dbName,
//             collection,
//             data,
//         });
//         return res.data;
//         } catch (error) {
//         throw normalizeError(error);
//         }
//     },
//
//     async read({ dbName, collection, filter = {} }) {
//         try {
//         const res = await apiTpost("/read", {
//             dbName,
//             collection,
//             filter,
//         });
//         return res.data;
//         } catch (error) {
//         throw normalizeError(error);
//         }
//     },
//
//     async update({ dbName, collection, filter, newData }) {
//         try {
//         const res = await apiTpost("/update", {
//             dbName,
//             collection,
//             filter,
//             newData,
//         });
//         return res.data;
//         } catch (error) {
//         throw normalizeError(error);
//         }
//     },
//
//     async delete({ dbName, collection, filter }) {
//         try {
//         const res = await apiTpost("/delete", {
//             dbName,
//             collection,
//             filter,
//         });
//         return res.data;
//         } catch (error) {
//         throw normalizeError(error);
//         }
//     },
// };
//
// module.exports = api;
