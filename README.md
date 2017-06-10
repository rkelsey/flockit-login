# flockit-login
Flockit Login

To log into the database, you need to set your environment variables to match those in Azure.
In an administrator Powershell run these commands:

[Environment]::SetEnvironmentVariable("DB_SERVER", /*address of server*/, "Machine")
[Environment]::SetEnvironmentVariable("DB_ADMIN", /*db admin username*/, "Machine")
[Environment]::SetEnvironmentVariable("DB_PW", /*db password*/, "Machine")
[Environment]::SetEnvironmentVariable("DB_NAME", /*db name*/, "Machine")

Once the application logic is ready, we'll switch to using local databases for testing and leave the production database alone. But until then, it's not a big deal.