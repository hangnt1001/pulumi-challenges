## Project setup
```
yarn install
```

### Run
```
node server.js
```
### DB migrations

Execute the following statement in the database to create the required table

```
create table tutorials (
    title varchar(255), 
    description varchar(255), 
    published BOOLEAN
);

```
