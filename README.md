# paper-collab

Backend of the rich editor [paper-editor](https://github.com/li-yechao/paper-editor).

## Installation

Install the dependencies:

```shell
yarn install
```

Build:

```shell
yarn build
```

Start:

```shell
yarn serve \
  -p 2022 \
  --ipfs-gateway-port 2023 \
  --ipfs-repo-path ipfs \
  --ipfs-gateway-uri http://localhost:2023/ipfs \
  --access-token-secret [secret] \
  --mongo-uri [mongodb://...] \
  --mongo-database paper \
  --mongo-collection-paper paper \
  --max-buffer-size 104857600
```

## Online Demo

<https://paper.yechao.xyz/editor?paperId=60c9a03a00eaf09700b8500f&socketUri=https://paper.yechao.xyz&accessToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE2MjU4ODUxNTUsImV4cCI6MTY1NzQyMTE1NSwic3ViIjoiNjAxM2FmMjcwMGNiN2FhNzAwMjY4NzAwIiwicGFwZXJfaWQiOiI2MGM5YTAzYTAwZWFmMDk3MDBiODUwMGYifQ.CsXGYBxYxub8Lx8OtTH2FflMy1cnbPe2cibHjIzPwRs>

## License

[Apache 2.0](LICENSE)
