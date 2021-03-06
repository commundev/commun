import Hidden from '@material-ui/core/Hidden'
import Drawer from '@material-ui/core/Drawer'
import React from 'react'
import { createStyles, makeStyles, Theme, useTheme } from '@material-ui/core/styles'
import Divider from '@material-ui/core/Divider'
import List from '@material-ui/core/List'
import { EntitiesDropdown } from './EntitiesDropdown'
import { PluginsDropdown } from './PluginsDropdown'
import { Link } from 'react-router-dom'
import ListItemIcon from '@material-ui/core/ListItemIcon'
import SettingsIcon from '@material-ui/icons/Settings'
import ListItemText from '@material-ui/core/ListItemText'
import ListItem from '@material-ui/core/ListItem'
import { useLocation } from 'react-router'
import { ServerSettings } from '../../services/ServerService'
import Typography from '@material-ui/core/Typography'

const drawerWidth = 240

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    drawer: {
      [theme.breakpoints.up('sm')]: {
        width: drawerWidth,
        flexShrink: 0,
      },
    },
    toolbar: theme.mixins.toolbar as any,
    drawerPaper: {
      width: drawerWidth,
    },
    versionText: {
      marginTop: theme.spacing(3),
      textAlign: 'center',
    },
  }),
)

interface Props {
  open: boolean
  onDrawerToggle: () => void
  serverSettings?: ServerSettings
}

export function SideMenu (props: Props) {
  const classes = useStyles()
  const theme = useTheme()
  const location = useLocation()
  const { serverSettings } = props

  const drawer = (
    <div>
      <div className={classes.toolbar}/>
      <Divider/>
      <List>
        <EntitiesDropdown/>
        <Divider/>
        <PluginsDropdown/>
        <Divider/>
        <ListItem button component={Link} to="/settings" selected={location.pathname === '/settings'}>
          <ListItemIcon><SettingsIcon/></ListItemIcon>
          <ListItemText primary="Settings"/>
        </ListItem>
        {
          serverSettings && (
            <>
              <Divider/>
              <Typography variant="subtitle2" noWrap className={classes.versionText}>
                Commun version: {serverSettings.communVersion}
              </Typography>
            </>
          )
        }
      </List>
    </div>
  )

  return (
    <nav className={classes.drawer} aria-label="mailbox folders">
      <Hidden smUp implementation="css">
        <Drawer
          variant="temporary"
          anchor={theme.direction === 'rtl' ? 'right' : 'left'}
          open={props.open}
          onClose={props.onDrawerToggle}
          classes={{
            paper: classes.drawerPaper,
          }}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
        >
          {drawer}
        </Drawer>
      </Hidden>
      <Hidden xsDown implementation="css">
        <Drawer
          classes={{
            paper: classes.drawerPaper,
          }}
          variant="permanent"
          open>
          {drawer}
        </Drawer>
      </Hidden>
    </nav>
  )
}
