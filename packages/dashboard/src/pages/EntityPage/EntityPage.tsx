import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { EntityService } from '../../services/EntityService'
import { EntityConfig, EntityModel } from '@commun/core'
import { CircularProgress, Container, makeStyles, Typography } from '@material-ui/core'
import { Layout } from '../../components/Layout/Layout'
import { EntitySettings } from './EntitySettings'
import { EntityPermissions } from './EntityPermissions'
import { EntitySchema } from './EntitySchema'
import { EntityJoinProperties } from './EntityJoinProperties'
import { EntityHooks } from './EntityHooks'
import { EntityIndexes } from './EntityIndexes'
import capitalize from '@material-ui/core/utils/capitalize'
import { EntityDangerZone } from './EntityDangerZone'
import { ExpansionMenu } from '../../components/ExpansionMenu'

const useStyles = makeStyles(theme => ({
  header: {
    marginBottom: theme.spacing(2),
  },
}))

export const EntityPage = () => {
  const classes = useStyles()
  const { entityName } = useParams<{ entityName: string }>()
  const [entity, setEntity] = useState<EntityConfig<EntityModel>>()

  useEffect(() => {
    (async () => {
      const res = await EntityService.getEntity(entityName!)
      setEntity(res.item)
    })()
  }, [entityName])

  if (!entity) {
    return <CircularProgress/>
  }

  const menuItems = [{
    key: 'settings',
    label: 'General settings',
    component: <EntitySettings entity={entity}/>,
    expanded: true,
  }, {
    key: 'permissions',
    label: 'Permissions',
    component: <EntityPermissions entity={entity}/>,
  }, {
    key: 'schema',
    label: 'Schema',
    component: <EntitySchema entity={entity}/>,
  }, {
    key: 'joinProperties',
    label: 'Join Properties',
    component: <EntityJoinProperties entity={entity}/>,
  }, {
    key: 'hooks',
    label: 'Hooks',
    component: <EntityHooks entity={entity}/>,
  }, {
    key: 'indexes',
    label: 'Indexes',
    component: <EntityIndexes entity={entity}/>,
  }, {
    key: 'dangerZone',
    label: 'Danger Zone',
    component: <EntityDangerZone entity={entity}/>
  }]

  return (
    <Layout>
      <Container maxWidth="lg">

        <header className={classes.header}>
          <Typography variant="h5">
            {capitalize(entityName)}
          </Typography>
        </header>

        <ExpansionMenu items={menuItems}/>

      </Container>
    </Layout>
  )
}
