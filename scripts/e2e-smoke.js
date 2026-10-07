const { handler } = require('../dist/handlers/usersHandler.js');

const base = { headers: { 'content-type': 'application/json' }, isBase64Encoded: false, requestContext: { requestId: 'e2e' } };

const event = (overrides) => ({
  httpMethod: 'GET',
  resource: '/users',
  path: '/users',
  body: null,
  ...base,
  ...overrides,
});

const show = async (label, res) => {
  const parsed = res.body ? JSON.parse(res.body) : {};
  const payload = parsed.data ? parsed.data : parsed.error;
  console.log(label.padEnd(14), res.statusCode, JSON.stringify(payload ?? '(sin body)').slice(0, 160));
};

(async () => {
  await show(
    'CREATE',
    await handler(
      event({ httpMethod: 'POST', body: JSON.stringify({ firstName: 'Zoe', lastName: 'Diaz', email: 'zoe.diaz@test.com', age: 41 }) })
    )
  );

  const list = await handler(event({ queryStringParameters: { page: '1', limit: '50' } }));
  const users = JSON.parse(list.body).data.users;
  const zoe = users.find((u) => u.email === 'zoe.diaz@test.com');
  const id = zoe ? zoe.id : users[0].id;

  await show('GET by id', await handler(event({ httpMethod: 'GET', resource: '/users/{id}', pathParameters: { id } })));
  await show(
    'UPDATE',
    await handler(event({ httpMethod: 'PUT', resource: '/users/{id}', pathParameters: { id }, body: JSON.stringify({ age: 42 }) }))
  );
  await show('DELETE', await handler(event({ httpMethod: 'DELETE', resource: '/users/{id}', pathParameters: { id } })));
  await show('DELETE again', await handler(event({ httpMethod: 'DELETE', resource: '/users/{id}', pathParameters: { id } })));

  console.log('--- seguridad ---');
  await show(
    'SQLi create',
    await handler(event({ httpMethod: 'POST', body: JSON.stringify({ firstName: "Bob'); DROP TABLE users;--", lastName: 'X', email: 'x@t.com' }) }))
  );
  await show('SQLi search', await handler(event({ queryStringParameters: { search: "' OR 1=1 --" } })));
  await show(
    'mass assign',
    await handler(event({ httpMethod: 'POST', body: JSON.stringify({ firstName: 'Bob', lastName: 'X', email: 'x@t.com', isAdmin: true }) }))
  );
  await show(
    'SQLi id',
    await handler(event({ httpMethod: 'GET', resource: '/users/{id}', pathParameters: { id: "1' OR '1'='1" } }))
  );
  await show('bad json', await handler(event({ httpMethod: 'POST', body: '{oops' })));
  await show(
    'wrong ctype',
    await handler(event({ httpMethod: 'POST', headers: { 'content-type': 'text/xml' }, body: '<a/>' }))
  );

  const final = await handler(event({ queryStringParameters: { limit: '50' } }));
  console.log('tabla intacta ->', JSON.parse(final.body).data.meta.total, 'registros');
  process.exit(0);
})();