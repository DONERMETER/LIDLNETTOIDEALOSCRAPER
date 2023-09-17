# Use an official Node runtime as a parent image
FROM node:14

# Install Chromium
RUN apt-get update && apt-get install -y chromium

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Run your code
CMD [ "node", "node.js" ]

