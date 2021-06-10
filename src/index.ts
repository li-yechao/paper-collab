import { program } from 'commander'
import ws from 'ws'
import Client from './client'
import Config from './config'

program.name('paper-collab')

program
  .command('serve')
  .description('Start collab server')
  .option('-p, --port [port]', 'Listening port', '8080')
  .requiredOption('--mongo-uri [uri]', 'Mongodb uri')
  .requiredOption('--mongo-database [database]', 'Mongodb database name')
  .requiredOption('--mongo-paper-collection [collection]', 'Mongodb paper collection name')
  .requiredOption(
    '--mongo-paper-content-collection [collection]',
    'Mongodb paper content collection name'
  )
  .requiredOption('--paper-graphql-uri [uri]', 'Paper graphql uri')
  .action(
    ({
      port,
      mongoUri,
      mongoDatabase,
      mongoPaperCollection,
      mongoPaperContentCollection,
      paperGraphqlUri,
    }) => {
      Config.initShared({
        port: Number(port),
        mongoUri,
        mongoDatabase,
        mongoPaperCollection,
        mongoPaperContentCollection,
        paperGraphqlUri,
      })

      const server = new ws.Server({ port: Config.shared.port })

      console.info(`Paper collab server started on port ${Config.shared.port}`)

      server.on('connection', (ws, req) => {
        console.info(`Client connected ${req.socket.remoteAddress}`)
        new Client(ws)
      })
    }
  )

program.parse(process.argv)

process.on('uncaughtException', e => {
  console.error(e)
})
