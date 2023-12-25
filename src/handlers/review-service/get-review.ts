export const handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      rating: 8.7,
      latestReviews: [
        "Great hotel, but the pool was dirty",
        "The toilet smelled a bit",
        "Great view!",
        "The bed was very comfortable",
      ],
    }),
  };
};
