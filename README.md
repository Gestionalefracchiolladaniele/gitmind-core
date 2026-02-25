# danspace

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts. At this point you're on your own.

You don't have to use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However, we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).


## GitHub OAuth callback setup (important)

If GitHub shows `The redirect_uri is not associated with this application`, configure the callback URL in your GitHub OAuth App.

1. Open GitHub **Developer settings → OAuth Apps → <your app>**.
2. Add the exact callback URL used by this app in **Authorization callback URL**.
3. Configure Supabase Edge Function secret:

```bash
GITHUB_REDIRECT_URI=https://your-domain.com/auth/callback
```

4. In frontend env, set:

```bash
VITE_GITHUB_REDIRECT_URI=https://your-domain.com/auth/callback
```

If `VITE_GITHUB_REDIRECT_URI` is not set, the app uses:

```text
${window.location.origin}/auth/callback
```

So for local development you typically need:

```text
http://localhost:5173/auth/callback
```
