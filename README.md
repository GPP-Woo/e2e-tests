# End to end tests for GPP-WOO

We will work on end to end tests for the different GPP-WOO components here.

Please use vscode and install the recommended extensions.

To run the tests, you will need a `.env` file in the root of this repository. See `.env.example` for an example.

To run the tests, run the following commands:

```sh
npm install
npx playwright install --with-deps
npm run test
```
