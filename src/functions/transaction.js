const ulid = require('ulid');
const { format } = require('date-fns');
// workflow id
const id = 'jsId';
const dbPrefix = get_db_name(process.env.MARIADB_URL) + "|";

function get_db_name(url) {
  const parts = url.split('/');
  return parts[parts.length - 1];
}

function generate_ulid() {
  const ulid7 = ulid.ulid(7);
  return ulid7;
}

function factor(dr_cr) {
  return dr_cr === 'Credit' ? -1 : 1;
}

function get_duration_starts(transaction_date) {
  return {
    "Daily": transaction_date,
    "Weekly": get_first_day_of_week(transaction_date),
    "Monthly": get_first_day(transaction_date),
    "Quarterly": get_quarter_start(transaction_date),
    "Yearly": get_year_start(transaction_date),
  }
}

function get_first_day_of_week(inputDate) {
  const date = new Date(inputDate);
  const currentDayIndex = date.getDay(); // Sunday is 0, Monday is 1, ...
  // Calculate the first day of the week by subtracting the current day index
  const firstDayOfWeek = new Date(date);
  firstDayOfWeek.setDate(date.getDate() - currentDayIndex);
  const formattedDate = firstDayOfWeek.toISOString().slice(0, 10);
  return formattedDate;
}

function get_first_day(inputDate) {
  const date = new Date(inputDate);
  // Set the day of the month to 1 to get the first day
  date.setDate(1);
  const formattedDate = date.toISOString().slice(0, 10);
  return formattedDate;
}

function get_quarter_start(inputDate) {
  const date = new Date(inputDate);
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  // Calculate the first month of the quarter
  const firstMonthOfQuarter = (quarter - 1) * 3;
  // Set the date to the first day of the first month of the quarter
  date.setMonth(firstMonthOfQuarter);
  date.setDate(1);
  const formattedDate = date.toISOString().slice(0, 10);
  return formattedDate;
}

function get_year_start(inputDate) {
  const date = new Date(inputDate);
  // Set the date to the first day of the current year
  date.setMonth(0); // January
  date.setDate(1);
  const formattedDate = date.toISOString().slice(0, 10);
  return formattedDate;
}

async function get_transaction_limits(maria_db_client, redis_client) {
  return await ctx.functions['com.biz.sor.get_transaction_limits'](ctx);
  // try {
  //   const key = `${dbPrefix}transaction_limits`;
  //   const cached_value = await redis_client.get(key);
  //   if (!cached_value) {
  //     const transaction_limits = await maria_db_client.tabTransaction_Limits.findMany({
  //       where: {
  //         enabled: {
  //           equals: 1
  //         }
  //       },
  //       select: {
  //         rule_json: true
  //       }
  //     });
  //     const ruleJsonValues = transaction_limits.map(item => JSON.parse(item.rule_json));
  //     await redis_client.set(key, JSON.stringify(ruleJsonValues));
  //     return ruleJsonValues;
  //   } else {
  //     return JSON.parse(cached_value);
  //   }
  // } catch (ex) {
  //   throw ex;
  // }
}

async function get_account_balance(maria_db_client, redis_client) {
  try {
    const key = `${dbPrefix}account_balance`;
    const cached_value = await redis_client.get(key);
    if (!cached_value) {
      const account_balance = await maria_db_client.tabBalance_Limits.findMany({
        where: {
          enabled: {
            equals: 1
          }
        },
        select: {
          rule_json: true
        }
      });
      const ruleJsonValues = account_balance.map(item => JSON.parse(item.rule_json));
      await redis_client.set(key, JSON.stringify(ruleJsonValues));
      return ruleJsonValues;
    } else {
      return JSON.parse(cached_value);
    }
  } catch (ex) {
    throw ex;
  }
}

async function get_transaction_type(maria_db_client, redis_client) {
  try {
    const key = `${dbPrefix}transaction_type`;
    const cached_value = await redis_client.get(key);
    if (!cached_value) {
      const transaction_type = await maria_db_client.tabTransaction_Type.findMany({
        select: {
          json: true
        }
      });
      const jsonValues = transaction_type.map(item => JSON.parse(item.json));
      await redis_client.set(key, JSON.stringify(jsonValues));
      return jsonValues;
    } else {
      return JSON.parse(cached_value);
    }
  } catch (ex) {
    throw ex;
  }
}

async function get_customer_transaction_freeze(maria_db_client, redis_client, customer, transaction_type) {
  try {
    const key = `${dbPrefix}customer:${customer}`;
    const cached_value = await redis_client.hGet(key, 'transaction_freeze');
    if (!cached_value) {
      const customer_transaction_freeze = await maria_db_client.tabCustomer_Transaction_Freeze.findMany({
        where: {
          parent: {
            equals: customer
          },
          transaction_type: {
            equals: transaction_type
          }
        },
        select: {
          transaction_type: true,
          freezed: true
        }
      });
      await redis_client.hSet(key, 'transaction_freeze', JSON.stringify(customer_transaction_freeze));
      return customer_transaction_freeze;
    } else {
      return JSON.parse(cached_value);
    }
  } catch (ex) {
    throw ex;
  }
}

async function get_customer_status_kyc_type(maria_db_client, redis_client, customer) {
  try {
    const key = `${dbPrefix}customer:${customer}`;
    const cached_status = await redis_client.hGet(key, 'status');
    const cached_kyc_type = await redis_client.hGet(key, 'kyc_type');
    if (!cached_status || !cached_kyc_type) {
      const customer_data = await maria_db_client.tabCustomer.findUnique({
        where: {
          name: customer
        },
        select: {
          status: true,
          kyc_type: true
        }
      })
      await redis_client.hSet(key, 'status', customer_data.status);
      await redis_client.hSet(key, 'kyc_type', customer_data.kyc_type);
      return customer_data;
    } else {
      return {
        "status": cached_status,
        "kyc_type": cached_kyc_type
      }
      //return JSON.parse(cached_value);
    }
  } catch (ex) {
    throw ex;
  }
}

module.exports = async (ctx) => {
  // In the current version, import all the libs with require
  const { GSStatus } = require("@godspeedsystems/core");
  const { inputs, childLogger } = ctx;
  const maria_db_client = ctx.datasources['mariadb'].client;
  const redis_client = ctx.datasources['redis'].client;
  let response;

  try {
    inputs.body = inputs.data.body
    childLogger.info('inputs: %o', inputs.body);

    // 1. check amount
    if (inputs.body.amount <= 0) {
      throw "Invalid Amount"
    }

    // 2. get TSP List
    const tsp = await maria_db_client.tabTSP_List.findMany({
      where: {
        tsp: {
          equals: inputs.body.tsp
        },
        parent: {
          equals: inputs.body.customer
        }
      }
    })
    if (tsp.length == 0) {
      throw (`Customer doesn't exist ${inputs.body.customer}`);
    }
    // 3. get customer and check its status
    const customer = await get_customer_status_kyc_type(maria_db_client, redis_client, inputs.body.customer);
    childLogger.debug("Customer status %s", customer.status)
    if (customer.status != "Active") {
      throw (`Customer is ${customer.status}`);
    }

    // 4. get account and check account & account_type
    const account = await maria_db_client.tabAccount.findUnique({
      where: {
        name: inputs.body.account
      },
      select: {
        customer: true,
        account_type: true
      }
    });
    if (account) {
      if (account.customer != inputs.body.customer) {
        throw ("Invalid Account");
      }
      if (account.account_type != inputs.body.account_type) {
        throw ("Invalid Account Type");
      }
    } else {
      throw ("Invalid Account");
    }

    // 5. get customer transaction freeze and check freezed
    const transaction_freeze = await get_customer_transaction_freeze(maria_db_client, redis_client, inputs.body.customer, inputs.body.transaction_type);
    for (const freeze of transaction_freeze) {
      childLogger.info('freeze: %o', freeze);
      if (freeze.freezed) {
        throw (`Transactions of type ${inputs.body.transaction_type} are frozen for this customer ${inputs.body.customer}`);
      }
    }

    // 6. get transaction_limits, account_balance, transaction_type
    const transaction_limits = await get_transaction_limits(maria_db_client, redis_client);

    const account_balance = await get_account_balance(maria_db_client, redis_client);
    const transaction_type = await get_transaction_type(maria_db_client, redis_client);
    // 7. check current transaction -- dr_cr and mandatory_fields
    let current_transaction = transaction_type.filter(t => t.title === inputs.body.transaction_type);

    childLogger.info('current_transaction: %o', current_transaction);

    if (current_transaction.length > 0) {
      if (!current_transaction[0].dr_cr.includes(inputs.body.dr_cr)) {
        throw (`Invalid Debit/ Credit for Transaction Type: ${inputs.body.transaction_type}`)
      }
      if (current_transaction[0].mandatory_fields) {
        const fields = current_transaction[0].mandatory_fields.split(",");
        for (const field of fields) {
          if (!inputs.body[field]) {
            throw `Missing required field: ${field} for Transaction Type: ${inputs.body.transaction_type}`;
          }
        }
      }
    } else {
      throw (`Could not find Transaction Type: ${inputs.body.transaction_type}`)
    }

    // 8. account_type -- if account is present in inputs.body then fetch the account_type information
    // from tabAccount (step 4) else assign inputs.body.account_type.
    // Althugh this check seems invalid as we are throwing error in step 4 if inputs.body.account_type != account.account_type
    // transaction.py --> account_type = get_account_type(self.account) if self.account else self.account_type
    const account__type = inputs.body.account_type;
    const kyc_type = customer.kyc_type;

    // 9. get duration_starts
    const duration_starts = get_duration_starts(inputs.body.original_transaction_date);


    // 10. get account_type_balance then create/update account_type_balance
    const account_type_balance = await maria_db_client.tabCustomer_Account_Balance.findMany({
      where: {
        customer: {
          equals: inputs.body.customer
        },
        account_type: {
          equals: account__type
        }
      },
      select: {
        name: true,
        account: true,
        balance: true
      }
    });

    childLogger.debug('account_type_balance: %o', account_type_balance);
    const customer_balance = {
      "name": generate_ulid(),
      "customer": inputs.body.customer,
      "account_type": account__type,
      "balance": inputs.body.amount
    };

    let account_balance_updated = false;
    if (account_type_balance.length != 0) {
      for (let balance of account_type_balance) {
        childLogger.debug('balance : %o', balance);
        if (!balance.account || (inputs.body.account && inputs.body.account === balance.account)) {
          balance.balance = parseFloat(balance.balance) + (parseFloat(inputs.body.amount) * parseFloat(-factor(inputs.body.dr_cr)))
          childLogger.debug('Checking balance.balance in parseFloat %s', balance.balance)
          if (balance.balance < 0) {
            throw `${account__type}: Insufficient Balance`;
          }
          childLogger.info("Updating Balance %o", balance);
          //frappe.db.set_value("Customer Account Balance", balance["name"], "balance", balance["balance"])
          const updated_cab = await maria_db_client.tabCustomer_Account_Balance.update({
            where: {
              name: balance.name
            },
            data: {
              balance: balance.balance
            }
          });

          if (!account_balance_updated) {
            account_balance_updated = inputs.body.account && inputs.body.account === balance.account;
          }
        }
      }
    } else {
      childLogger.debug('dr_cr: %s', inputs.body.dr_cr);
      if (inputs.body.dr_cr !== 'Credit') {
        throw `${account__type}: Insufficient Balance`;
      }
      const created_cab = await maria_db_client.tabCustomer_Account_Balance.create({
        data: customer_balance
      });
      childLogger.debug('Created Customer Account Balance: %o', created_cab);
    }

    if (inputs.body.account && !account_balance_updated) {
      childLogger.debug('account_balance_updated: %s', account_balance_updated);
      if (inputs.body.dr_cr != "Credit") {
        throw `${account__type}: Insufficient Balance`;
      }
      // TODO --> To check with Samba, seems redudant
      // childLogger.debug('creating customer account balance');
      // customer_balance.account = inputs.body.account;
      // const created_cab = await maria_db_client.tabCustomer_Account_Balance.create({
      //     data: customer_balance
      // });

    }


    childLogger.info("account_type: %s, kyc_type: %s, duration_starts: %o", account__type, kyc_type, duration_starts);

    // 11. check balance limit rules
    let customer_balances = [];
    try {
      await maria_db_client.$transaction(async (tx) => {
        childLogger.info('ENTRY balance limit rules');
        for (const balance of account_balance) {
          childLogger.debug('BLR balance: %o', balance);
          if (balance.account_type.includes(account__type)) {
            let customer_balance = await tx.tabCustomer_Balance_Limits.findMany({
              where: {
                customer: inputs.body.customer,
                rule_name: balance.name
              },
              select: {
                name: true,
                current_balance: true
              }
            });
            customer_balance = customer_balance[0]; //Assuming only 1 row is going to match

            if (customer_balance.length == 0) {
              customer_balance = {
                name: generate_ulid(),
                customer: inputs.body.customer,
                rule_name: balance.name,
                balance: balance.balance,
                current_balance: 0
              };

              childLogger.info('BLR creating customer balance limits: %o', customer_balance);
              const created_cbl = await tx.tabCustomer_Balance_Limits.create({
                data: customer_balance
              });
              childLogger.debug('BLR created customer balance limit: %o', created_cbl);
            }

            const amount = parseFloat(customer_balance.current_balance) + (parseFloat(inputs.body.amount) * parseFloat(-factor(inputs.body.dr_cr)));
            childLogger.info('Applying account balance rule %d %o %d', customer_balance.current_balance, balance, amount);

            if ((!balance.kyc_type || kyc_type === balance.kyc_type) && (current_transaction && current_transaction.apply_rules !== 0)) {
              if (amount < 0) {
                throw `${balance.name}: Insufficient Balance`;
              }

              if (amount > balance.balance) {
                throw `${balance.name}: Balance Exceeded`;
              }
            }

            customer_balance.current_balance = amount;
            customer_balance.balance = balance.balance;
            childLogger.debug('BLR customer_balance %o', customer_balance);
            customer_balances.push(customer_balance);
          }
        }

        childLogger.info('BLR customer_balances: %o', customer_balances);

        for (const balance of customer_balances) {
          const updated_cab = await tx.tabCustomer_Balance_Limits.update({
            where: {
              name: balance.name
            },
            data: {
              current_balance: balance.current_balance,
              balance: balance.balance,
              remaining_balance: balance.balance - balance.current_balance
            }
          });
        }
        if (current_transaction && current_transaction.apply_rules === 0) {
          childLogger.info('BLR exiting current_transaction: %o', current_transaction);
          return;
        }
      })
      childLogger.info('EXIT balance limit rules');
    } catch (err) {
      throw err;
    }

    // 12. Check transaction limit rules
    // Assuming transaction_limits is an array of objects
    let customer_limits = [];
    try {
      await maria_db_client.$transaction(async (tx) => {
        childLogger.info('ENTRY transaction limit rules');
        for (let limit of transaction_limits) {
          childLogger.debug('TLR limit: %o', limit);
          if (account__type && limit.account_type.includes(account__type) &&
            (limit.transaction_type.length == 0 || limit.transaction_type.includes(inputs.body.transaction_type)) &&
            (!limit.dr_cr || inputs.body.dr_cr === limit.dr_cr)) {

            childLogger.info("Applying transaction limit rule %o", limit);

            const duration_start = duration_starts[limit.duration];
            if (limit.per_beneficiary) {
              if (!inputs.body.beneficiary) {
                continue;
              }
            }
            //let customer_limit = frappe.db.get_value("Customer Transaction Limits", filters, ["name", "period_start", "current_limit_value"], { asDict: true, forUpdate: true });
            let customer_limit = await tx.tabCustomer_Transaction_Limits.findMany({
              where: {
                rule_name: {
                  equals: limit.name
                },
                customer: {
                  equals: inputs.body.customer
                },
                beneficiary: {
                  equals: inputs.body.beneficiary
                }
              },
              select: {
                name: true,
                period_start: true,
                current_limit_value: true
              }
            });

            // let customer_limit = await tx.$queryRaw`SELECT name, period_start, current_limit_value from card91.\`tabCustomer Transaction Limits\` where rule_name=${limit.name} and customer=${inputs.body.customer} and beneficiary=${inputs.body.beneficiary}`;

            customer_limit = customer_limit[0]; //Assuming only 1 row is going to match
            if (!customer_limit) {
              customer_limit = {
                name: generate_ulid(),
                customer: inputs.body.customer,
                rule_name: limit.name,
                period_start: new Date(duration_start),
                duration: limit.duration,
                limit_value: limit.limit_value,
                beneficiary: inputs.body.beneficiary,
                current_limit_value: 0
              };
              childLogger.info('TLR creating customer transaction limits: %o', customer_limit);
              const created_ctl = await tx.tabCustomer_Transaction_Limits.create({
                data: customer_limit
              });
              //const created_ctl = await tx.$executeRaw`INSERT INTO card91.\`tabCustomer Transaction Limits\` (name,customer,rule_name,duration,period_start,limit_value,beneficiary,current_limit_value) VALUES (${customer_limit.name},${customer_limit.customer},${customer_limit.rule_name},${customer_limit.duration},${customer_limit.period_start},${customer_limit.limit_value},${customer_limit.beneficiary},${customer_limit.current_limit_value})`;
              childLogger.debug('TLR created customer transaction limits: %o', created_ctl);
            }

            let amount = (limit.aggregate_function !== 'COUNT') ? inputs.body.amount : 1;
            let transaction_amount = amount;
            const period_start_date_only = format(customer_limit.period_start, 'yyyy-MM-dd');
            childLogger.debug('TLR period_start_date_only: %s, duration_start: %s', period_start_date_only, duration_start);
            if (period_start_date_only === duration_start) {
              if (limit.dr_cr) {
                amount = parseFloat(customer_limit.current_limit_value) + parseFloat(transaction_amount);
              } else {
                amount = parseFloat(customer_limit.current_limit_value) + (parseFloat(transaction_amount) * parseFloat(factor(inputs.body.dr_cr)));
              }
            }

            if (amount < 0) {
              amount = 0;
            }

            if (!limit.kyc_type || kyc_type === limit.kyc_type) {
              childLogger.info("TLR amount: %s, limit: %s", amount, limit);
              if (amount > limit.limit_value) {
                throw `${limit.name}: Limit Exceeded`;
              }
            }

            customer_limit.duration = limit.duration;
            customer_limit.period_start = duration_start;
            customer_limit.current_limit_value = amount;
            customer_limit.limit_value = limit.limit_value;
            customer_limits.push(customer_limit);
          }
        }

        childLogger.info('TLR customer_limits: %o', customer_limits);

        for (let limit of customer_limits) {
          const updated_ctl = await tx.tabCustomer_Transaction_Limits.update({
            where: {
              name: limit.name
            },
            data: {
              period_start: new Date(limit.period_start),
              current_limit_value: limit.current_limit_value,
              remaining_limit_value: limit.limit_value - limit.current_limit_value,
              limit_value: limit.limit_value
            }
          });
          //updated_ctl = await tx.$executeRaw`UPDATE card91.\`tabCustomer Transaction Limits\` SET period_start=${limit.period_start} where name=${limit.name}`;
        }
        childLogger.info('EXIT transaction limit rules');
      })
    } catch (err) {
      throw err;
    }

    const responseData = inputs.body

    response = new GSStatus(true, 200, undefined, responseData, undefined);
    childLogger.info(response);
    ctx.outputs[id] = response;
    //return response; --> TODO TECH-258, currently not working
  } catch (error) {
    const errorData = error.stack || error;
    const errorRes = {
      "exc_type": "LinkValidationError",
      "exception": errorData
    };
    response = new GSStatus(false, 417, undefined, errorRes, undefined);
    ctx.outputs[id] = response;
    //return response;
  }
};

module.exports.id = id;
