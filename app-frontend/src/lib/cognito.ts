import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
} from "amazon-cognito-identity-js";

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!;
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;

export const userPool = new CognitoUserPool({
  UserPoolId: userPoolId,
  ClientId: clientId,
});

export function signIn(email: string, password: string): Promise<string> {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const accessToken = session.getAccessToken().getJwtToken();
        const idToken = session.getIdToken().getJwtToken();

        localStorage.setItem("access_token", accessToken);
        localStorage.setItem("id_token", idToken);

        resolve(accessToken);
      },
      onFailure: reject,
    });
  });
}

export function signUp(
  name: string,
  email: string,
  password: string
): Promise<void> {
  const [givenName, ...rest] = name.trim().split(" ");
  const familyName = rest.join(" ") || "-";

  const attributes = [
    new CognitoUserAttribute({
      Name: "email",
      Value: email,
    }),
    new CognitoUserAttribute({
      Name: "given_name",
      Value: givenName,
    }),
    new CognitoUserAttribute({
      Name: "family_name",
      Value: familyName,
    }),
  ];

  return new Promise((resolve, reject) => {
    userPool.signUp(email, password, attributes, [], (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function confirmSignUp(
  email: string,
  code: string
): Promise<void> {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

/**
 * Kayıt doğrulama kodunu yeniden gönderir (kod ulaşmadıysa / süresi dolduysa).
 * Cognito bu çağrıyı hesap enumeration'a karşı korur; var olmayan email'de de
 * hata fırlatabilir — UI tarafında genel bir başarı mesajı göstermek yeterli.
 */
export function resendConfirmationCode(email: string): Promise<void> {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    user.resendConfirmationCode((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function forgotPassword(email: string): Promise<void> {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const user = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  return new Promise((resolve, reject) => {
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject,
    });
  });
}


export function updateDisplayName(
  givenName: string,
  familyName: string
): Promise<void> {
  const cognitoUser = userPool.getCurrentUser();
  if (!cognitoUser) return Promise.reject(new Error("Not signed in"));

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((err: Error | null) => {
      if (err) { reject(err); return; }

      const attributes = [
        new CognitoUserAttribute({ Name: "given_name", Value: givenName }),
        new CognitoUserAttribute({ Name: "family_name", Value: familyName || "-" }),
      ];

      cognitoUser.updateAttributes(attributes, (error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
  });
}

export function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const cognitoUser = userPool.getCurrentUser();
  if (!cognitoUser) return Promise.reject(new Error("Not signed in"));

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((err: Error | null) => {
      if (err) { reject(err); return; }

      cognitoUser.changePassword(oldPassword, newPassword, (error) => {
        if (error) { reject(error); return; }
        resolve();
      });
    });
  });
}
