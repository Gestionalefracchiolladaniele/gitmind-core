export const fetchUserRepos = async () => {
  const token = localStorage.getItem("github_token");

  if (!token) {
    throw new Error("GitHub token non trovato");
  }

  const response = await fetch("https://api.github.com/user/repos", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error("Errore nel recupero repository");
  }

  return response.json();
};
