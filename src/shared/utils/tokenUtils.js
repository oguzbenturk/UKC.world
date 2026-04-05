export const isTokenValid = (token) => {
  if (!token) return false;

  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return false;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const { exp } = JSON.parse(jsonPayload);
    return exp * 1000 > Date.now();
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
};